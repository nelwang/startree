import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it, vi } from 'vitest';

import {
  SYSTEM_ROOT_FOLDER_ID,
  type BookmarkCommand,
  type BookmarkSnapshot,
} from '../../shared/bookmarks/contracts';
import {
  createFetchBookmarkAdapter,
  createIndexedDbBookmarkAdapter,
  UnknownBookmarkCommandError,
} from './bookmark-adapters';

const snapshot = (revision: number): BookmarkSnapshot => ({
  wireFormatVersion: 1,
  revision,
  folders: [
    {
      id: SYSTEM_ROOT_FOLDER_ID,
      name: '',
      parentId: null,
      rank: '0',
      createdAt: '1970-01-01T00:00:00.000Z',
      modifiedAt: '1970-01-01T00:00:00.000Z',
      version: 1,
    },
  ],
  bookmarks: [],
  tags: [],
  sequences: [{ folderId: SYSTEM_ROOT_FOLDER_ID, folderVersion: 1, bookmarkVersion: 1 }],
});

describe('production Bookmark adapters', () => {
  it('Fetch Adapter conditionally loads and validates snapshots', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json(snapshot(4), { headers: { ETag: '"bookmarks-1-4"' } }));
    const adapter = createFetchBookmarkAdapter(fetcher);

    await expect(adapter.readSnapshot(3)).resolves.toEqual(snapshot(4));
    expect(fetcher).toHaveBeenCalledWith('/api/bookmarks/snapshot', {
      headers: { 'If-None-Match': '"bookmarks-1-3"' },
      signal: undefined,
    });

    fetcher.mockResolvedValueOnce(new Response(null, { status: 304 }));
    await expect(adapter.readSnapshot(4)).resolves.toBeNull();
  });

  it('Fetch Adapter rejects an invalid complete snapshot', async () => {
    const adapter = createFetchBookmarkAdapter(
      vi.fn<typeof fetch>().mockResolvedValue(Response.json({ revision: 4 })),
    );

    await expect(adapter.readSnapshot(null)).rejects.toThrow();
  });

  it('Fetch Adapter conditionally loads validated online-only Trash', async () => {
    const trash = {
      wireFormatVersion: 1 as const,
      revision: 4,
      roots: [],
      folders: [],
      bookmarks: [],
      tags: [],
    };
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json(trash));
    const adapter = createFetchBookmarkAdapter(fetcher);
    await expect(adapter.readTrash(3)).resolves.toEqual(trash);
    expect(fetcher).toHaveBeenCalledWith('/api/bookmarks/trash', {
      headers: { 'If-None-Match': '"bookmark-trash-1-3"' },
      signal: undefined,
    });
    fetcher.mockResolvedValueOnce(new Response(null, { status: 304 }));
    await expect(adapter.readTrash(4)).resolves.toBeNull();
  });

  it('Fetch Adapter sends commands and validates authoritative results', async () => {
    const command: BookmarkCommand = {
      type: 'createFolder',
      operationId: 'a0000000-0000-4000-8000-000000000001',
      parentId: SYSTEM_ROOT_FOLDER_ID,
      expectedFolderSequenceVersion: 1,
      name: 'Reading',
    };
    const result = {
      status: 'acknowledged' as const,
      operationId: command.operationId,
      revision: 2,
      folders: [],
      bookmarks: [],
      tags: [],
      sequences: [],
    };
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json(result));
    const adapter = createFetchBookmarkAdapter(fetcher);

    await expect(adapter.executeCommand(command)).resolves.toEqual(result);
    expect(fetcher).toHaveBeenCalledWith(
      '/api/bookmarks/commands',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: undefined,
      }),
    );
    expect(JSON.parse(fetcher.mock.calls[0]![1]!.body as string)).toEqual(command);
  });

  it('classifies a lost command response as an unknown commit outcome', async () => {
    const adapter = createFetchBookmarkAdapter(
      vi.fn<typeof fetch>().mockRejectedValue(new TypeError('network failed')),
    );
    const command: BookmarkCommand = {
      type: 'editFolder',
      operationId: 'a0000000-0000-4000-8000-000000000002',
      folderId: SYSTEM_ROOT_FOLDER_ID,
      folderVersion: 1,
      name: 'Reading',
    };

    await expect(adapter.executeCommand(command)).rejects.toBeInstanceOf(
      UnknownBookmarkCommandError,
    );
  });

  it.each([
    ['a server failure', new Response('{}', { status: 500 })],
    ['a malformed acknowledged response', Response.json({ status: 'acknowledged' })],
  ])('classifies %s as an unknown commit outcome', async (_label, response) => {
    const adapter = createFetchBookmarkAdapter(vi.fn<typeof fetch>().mockResolvedValue(response));
    const command: BookmarkCommand = {
      type: 'editFolder',
      operationId: 'a0000000-0000-4000-8000-000000000004',
      folderId: SYSTEM_ROOT_FOLDER_ID,
      folderVersion: 1,
      name: 'Reading',
    };

    await expect(adapter.executeCommand(command)).rejects.toBeInstanceOf(
      UnknownBookmarkCommandError,
    );
  });

  it('IndexedDB Adapter atomically promotes snapshots and retains navigation', async () => {
    const adapter = createIndexedDbBookmarkAdapter(new IDBFactory(), 'startree-test');

    await adapter.writeSnapshot(snapshot(1), { synchronizedAt: '2026-08-18T20:00:00.000Z' });
    await adapter.writeNavigation({
      selectedFolderId: SYSTEM_ROOT_FOLDER_ID,
      expandedFolderIds: ['10000000-0000-4000-8000-000000000001'],
    });
    await adapter.writeSnapshot(snapshot(2), { synchronizedAt: '2026-08-18T21:00:00.000Z' });

    await expect(adapter.readSnapshot()).resolves.toEqual({
      status: 'compatible',
      snapshot: snapshot(2),
      synchronizedAt: '2026-08-18T21:00:00.000Z',
    });
    await expect(adapter.readNavigation()).resolves.toEqual({
      selectedFolderId: SYSTEM_ROOT_FOLDER_ID,
      expandedFolderIds: ['10000000-0000-4000-8000-000000000001'],
    });
  });

  it('records a confirmed refresh time for the active snapshot only', async () => {
    const adapter = createIndexedDbBookmarkAdapter(new IDBFactory(), 'startree-synchronized');
    await adapter.writeSnapshot(snapshot(1), { synchronizedAt: '2026-08-18T20:00:00.000Z' });

    await adapter.writeSnapshotSynchronization(snapshot(1), '2026-08-18T22:00:00.000Z');
    await expect(adapter.readSnapshot()).resolves.toEqual({
      status: 'compatible',
      snapshot: snapshot(1),
      synchronizedAt: '2026-08-18T22:00:00.000Z',
    });

    await adapter.writeSnapshotSynchronization(snapshot(9), '2026-08-18T23:00:00.000Z');
    await expect(adapter.readSnapshot()).resolves.toMatchObject({
      synchronizedAt: '2026-08-18T20:00:00.000Z',
    });
  });

  it('removes superseded snapshots of its format and keeps other formats', async () => {
    const indexedDb = new IDBFactory();
    const databaseName = 'startree-superseded';
    const adapter = createIndexedDbBookmarkAdapter(indexedDb, databaseName);
    await adapter.writeSnapshot(snapshot(1), { synchronizedAt: '2026-08-18T20:00:00.000Z' });
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDb.open(databaseName, 3);
      request.addEventListener('success', () => resolve(request.result), { once: true });
      request.addEventListener('error', () => reject(request.error), { once: true });
    });
    const foreign = database.transaction('completeSnapshots', 'readwrite');
    foreign.objectStore('completeSnapshots').put({
      key: '99:7',
      wireFormatVersion: 99,
      revision: 7,
      snapshot: { wireFormatVersion: 99, revision: 7 },
    });
    await new Promise<void>((resolve, reject) => {
      foreign.addEventListener('complete', () => resolve(), { once: true });
      foreign.addEventListener('error', () => reject(foreign.error), { once: true });
    });

    await adapter.writeSnapshot(snapshot(2), { synchronizedAt: '2026-08-18T21:00:00.000Z' });
    await adapter.writeSnapshot(snapshot(3), { synchronizedAt: '2026-08-18T22:00:00.000Z' });

    const keys = await new Promise<IDBValidKey[]>((resolve, reject) => {
      const read = database
        .transaction('completeSnapshots', 'readonly')
        .objectStore('completeSnapshots')
        .getAllKeys();
      read.addEventListener('success', () => resolve(read.result), { once: true });
      read.addEventListener('error', () => reject(read.error), { once: true });
    });
    expect([...keys].sort()).toEqual(['1:3', '99:7']);
    await expect(adapter.readSnapshot()).resolves.toMatchObject({ snapshot: snapshot(3) });
    database.close();
  });

  describe('retained snapshot validation', () => {
    const databaseName = 'startree-schema';
    const openDatabase = (indexedDb: IDBFactory) =>
      new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDb.open(databaseName, 3);
        request.addEventListener('success', () => resolve(request.result), { once: true });
        request.addEventListener('error', () => reject(request.error), { once: true });
      });
    const request = <Result>(read: IDBRequest<Result>) =>
      new Promise<Result>((resolve, reject) => {
        read.addEventListener('success', () => resolve(read.result), { once: true });
        read.addEventListener('error', () => reject(read.error), { once: true });
      });
    const replaceActiveRecord = async (indexedDb: IDBFactory, record: Record<string, unknown>) => {
      const database = await openDatabase(indexedDb);
      const transaction = database.transaction('completeSnapshots', 'readwrite');
      transaction.objectStore('completeSnapshots').put({ key: '1:1', ...record });
      await new Promise<void>((resolve, reject) => {
        transaction.addEventListener('complete', () => resolve(), { once: true });
        transaction.addEventListener('error', () => reject(transaction.error), { once: true });
      });
      return database;
    };
    const storedSchemaId = async (database: IDBDatabase) =>
      (
        await request<{ schemaId?: string } | undefined>(
          database.transaction('completeSnapshots').objectStore('completeSnapshots').get('1:1'),
        )
      )?.schemaId;
    const invalid = () => ({
      ...snapshot(1),
      bookmarks: [{ ...snapshot(1).folders[0], url: 'not a URL' }],
    });

    it('validates records from shells built with another contract', async () => {
      const indexedDb = new IDBFactory();
      const adapter = createIndexedDbBookmarkAdapter(indexedDb, databaseName);
      await adapter.writeSnapshot(snapshot(1), { synchronizedAt: '2026-08-18T20:00:00.000Z' });
      const database = await replaceActiveRecord(indexedDb, {
        wireFormatVersion: 1,
        revision: 1,
        snapshot: invalid(),
        schemaId: 'another-contract',
      });

      await expect(adapter.readSnapshot()).resolves.toEqual({
        status: 'incompatible',
        wireFormatVersion: 1,
      });
      expect(await storedSchemaId(database)).toBe('another-contract');
      database.close();
    });

    it('trusts records written by a shell with this contract', async () => {
      const indexedDb = new IDBFactory();
      const adapter = createIndexedDbBookmarkAdapter(indexedDb, databaseName);
      await adapter.writeSnapshot(snapshot(1), { synchronizedAt: '2026-08-18T20:00:00.000Z' });
      const database = await openDatabase(indexedDb);
      const schemaId = await storedSchemaId(database);
      expect(schemaId).toEqual(expect.any(String));
      await replaceActiveRecord(indexedDb, {
        wireFormatVersion: 1,
        revision: 1,
        snapshot: invalid(),
        schemaId,
      });

      await expect(adapter.readSnapshot()).resolves.toMatchObject({
        status: 'compatible',
        snapshot: invalid(),
      });
      database.close();
    });

    it('marks a valid record from an older shell after validating it once', async () => {
      const indexedDb = new IDBFactory();
      const adapter = createIndexedDbBookmarkAdapter(indexedDb, databaseName);
      await adapter.writeSnapshot(snapshot(1), { synchronizedAt: '2026-08-18T20:00:00.000Z' });
      const database = await openDatabase(indexedDb);
      const schemaId = await storedSchemaId(database);
      await replaceActiveRecord(indexedDb, {
        wireFormatVersion: 1,
        revision: 1,
        snapshot: snapshot(1),
      });

      await expect(adapter.readSnapshot()).resolves.toMatchObject({
        status: 'compatible',
        snapshot: snapshot(1),
      });
      await vi.waitFor(async () => expect(await storedSchemaId(database)).toBe(schemaId));
      database.close();
    });
  });

  it('retains the prior complete snapshot when replacement is interrupted', async () => {
    const indexedDb = new IDBFactory();
    const adapter = createIndexedDbBookmarkAdapter(indexedDb, 'startree-interrupted');
    await adapter.writeSnapshot(snapshot(1), { synchronizedAt: '2026-08-18T20:00:00.000Z' });
    const interrupted = createIndexedDbBookmarkAdapter(indexedDb, 'startree-interrupted', {
      beforeSnapshotCommit(transaction) {
        transaction.abort();
      },
    });

    await expect(
      interrupted.writeSnapshot(snapshot(2), { synchronizedAt: '2026-08-18T21:00:00.000Z' }),
    ).rejects.toThrow();
    await expect(adapter.readSnapshot()).resolves.toEqual({
      status: 'compatible',
      snapshot: snapshot(1),
      synchronizedAt: '2026-08-18T20:00:00.000Z',
    });
  });

  it('preserves but does not interpret an incompatible active snapshot', async () => {
    const indexedDb = new IDBFactory();
    const databaseName = 'startree-incompatible';
    const adapter = createIndexedDbBookmarkAdapter(indexedDb, databaseName);
    await adapter.writeSnapshot(snapshot(1), { synchronizedAt: '2026-08-18T20:00:00.000Z' });

    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDb.open(databaseName, 3);
      request.addEventListener('success', () => resolve(request.result), { once: true });
      request.addEventListener('error', () => reject(request.error), { once: true });
    });
    const transaction = database.transaction(['completeSnapshots', 'settings'], 'readwrite');
    transaction.objectStore('completeSnapshots').put({
      key: '99:7',
      wireFormatVersion: 99,
      revision: 7,
      snapshot: { wireFormatVersion: 99, revision: 7, privateData: 'retained' },
    });
    transaction.objectStore('settings').put({ key: 'activeSnapshotKey', value: '99:7' });
    await new Promise<void>((resolve, reject) => {
      transaction.addEventListener('complete', () => resolve(), { once: true });
      transaction.addEventListener('error', () => reject(transaction.error), { once: true });
    });

    await expect(adapter.readSnapshot()).resolves.toEqual({
      status: 'incompatible',
      wireFormatVersion: 99,
    });
    expect(
      await new Promise<unknown>((resolve, reject) => {
        const read = database
          .transaction('completeSnapshots', 'readonly')
          .objectStore('completeSnapshots')
          .get('99:7');
        read.addEventListener('success', () => resolve(read.result), { once: true });
        read.addEventListener('error', () => reject(read.error), { once: true });
      }),
    ).toMatchObject({ snapshot: { privateData: 'retained' } });
    database.close();
  });

  it('migrates the previous complete snapshot without losing it', async () => {
    const indexedDb = new IDBFactory();
    const databaseName = 'startree-version-one';
    const legacyDatabase = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDb.open(databaseName, 1);
      request.addEventListener('upgradeneeded', () => {
        request.result.createObjectStore('snapshots', { keyPath: 'revision' });
        request.result.createObjectStore('settings', { keyPath: 'key' });
      });
      request.addEventListener('success', () => resolve(request.result), { once: true });
      request.addEventListener('error', () => reject(request.error), { once: true });
    });
    const legacyTransaction = legacyDatabase.transaction(['snapshots', 'settings'], 'readwrite');
    legacyTransaction.objectStore('snapshots').put(snapshot(4));
    legacyTransaction.objectStore('settings').put({ key: 'activeSnapshotRevision', value: 4 });
    await new Promise<void>((resolve) =>
      legacyTransaction.addEventListener('complete', () => resolve(), { once: true }),
    );
    legacyDatabase.close();

    const adapter = createIndexedDbBookmarkAdapter(indexedDb, databaseName);

    await expect(adapter.readSnapshot()).resolves.toEqual({
      status: 'compatible',
      snapshot: snapshot(4),
      synchronizedAt: null,
    });
  });

  it('clears all retained Bookmark data', async () => {
    const indexedDb = new IDBFactory();
    const databaseName = 'startree-clear';
    const adapter = createIndexedDbBookmarkAdapter(indexedDb, databaseName);
    await adapter.writeSnapshot(snapshot(1), { synchronizedAt: '2026-08-18T20:00:00.000Z' });

    await adapter.clear();

    const replacement = createIndexedDbBookmarkAdapter(indexedDb, databaseName);
    await expect(replacement.readSnapshot()).resolves.toEqual({ status: 'empty' });
  });

  it('persists and clears unconfirmed Bookmark operations', async () => {
    const adapter = createIndexedDbBookmarkAdapter(new IDBFactory(), 'startree-unconfirmed');
    const command: BookmarkCommand = {
      type: 'createFolder',
      operationId: 'a0000000-0000-4000-8000-000000000003',
      parentId: SYSTEM_ROOT_FOLDER_ID,
      expectedFolderSequenceVersion: 1,
      name: 'Reading',
    };

    await adapter.writeUnconfirmedOperation(command, '2026-08-18T20:00:00.000Z');
    await expect(adapter.readUnconfirmedOperations()).resolves.toEqual([
      { command, recordedAt: '2026-08-18T20:00:00.000Z' },
    ]);
    await adapter.removeUnconfirmedOperation(command.operationId);
    await expect(adapter.readUnconfirmedOperations()).resolves.toEqual([]);
  });
});
