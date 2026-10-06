import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { createIndexedDbBookmarkAdapter } from './bookmark-adapters';
import {
  createRecentBookmarks,
  normalizeRecentBookmarks,
  RECENT_BOOKMARKS_LIMIT,
  RECENT_BOOKMARKS_SETTING,
} from './recent-bookmarks';

describe('browser-local recent Bookmarks', () => {
  it('persists a bounded unique list with reopened Bookmarks first', async () => {
    const indexedDb = new IDBFactory();
    const storage = createIndexedDbBookmarkAdapter(indexedDb);
    const recent = createRecentBookmarks(storage);
    for (let i = 0; i < 15; i++) await recent.record(`bookmark-${i}`);
    const ids = await recent.record('bookmark-10');
    expect(ids).toHaveLength(RECENT_BOOKMARKS_LIMIT);
    expect(ids.slice(0, 3)).toEqual(['bookmark-10', 'bookmark-14', 'bookmark-13']);
    expect(new Set(ids).size).toBe(RECENT_BOOKMARKS_LIMIT);
    expect(await createRecentBookmarks(createIndexedDbBookmarkAdapter(indexedDb)).read()).toEqual(
      ids,
    );
    expect(ids).not.toContain('bookmark-0');
  });

  it('serializes concurrent tab writes and observes clearing without resurrecting entries', async () => {
    const indexedDb = new IDBFactory();
    const first = createRecentBookmarks(createIndexedDbBookmarkAdapter(indexedDb));
    const second = createRecentBookmarks(createIndexedDbBookmarkAdapter(indexedDb));
    await Promise.all([first.read(), second.read()]);
    await Promise.all([first.record('one'), second.record('two')]);
    expect(await first.read()).toEqual(['two', 'one']);
    await first.clear();
    expect(await second.read()).toEqual([]);
    expect(await second.record('three')).toEqual(['three']);
  });

  it('merges history retained by earlier shells after newer openings and clears it', async () => {
    const indexedDb = new IDBFactory();
    const databaseName = 'startree-legacy-recent';
    const storage = createIndexedDbBookmarkAdapter(indexedDb, databaseName);
    await storage.readRecentBookmarks();
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDb.open(databaseName, 3);
      request.addEventListener('success', () => resolve(request.result), { once: true });
      request.addEventListener('error', () => reject(request.error), { once: true });
    });
    const transaction = database.transaction('settings', 'readwrite');
    transaction
      .objectStore('settings')
      .put({ key: RECENT_BOOKMARKS_SETTING, value: ['old', 'new'] });
    await new Promise<void>((resolve) =>
      transaction.addEventListener('complete', () => resolve(), { once: true }),
    );
    database.close();
    const recent = createRecentBookmarks(storage);

    expect(await recent.record('new')).toEqual(['new', 'old']);
    expect(await recent.clear()).toEqual([]);
    expect(await createRecentBookmarks(storage).read()).toEqual([]);
  });

  it('keeps session history when persistence fails and never rejects into navigation', async () => {
    const recent = createRecentBookmarks({
      readRecentBookmarks: async () => [],
      recordRecentBookmark: async () => {
        throw new Error('Storage blocked');
      },
      clearRecentBookmarks: async () => {
        throw new Error('Storage blocked');
      },
    });
    await recent.record('one');
    expect(await recent.record('two')).toEqual(['two', 'one']);
    expect(await recent.read()).toEqual(['two', 'one']);
    expect(await recent.clear()).toEqual([]);
  });

  it('filters malformed or duplicate retained entries', () => {
    expect(normalizeRecentBookmarks(undefined)).toEqual([]);
    expect(normalizeRecentBookmarks([null, 1, 'one', 'one', 'two', ''])).toEqual(['one', 'two']);
    expect(normalizeRecentBookmarks({})).toEqual([]);
  });
});
