import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, existsSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { parseDeploymentConfig } from '../deployment.config.ts';
import { getEnvironment } from '../cloudflare.environments.ts';
import { createConfiguration } from '../cloudflare.config.ts';
import { deploymentFixture } from './deployment-fixture.mjs';

const moduleUrl = (name) => new URL(name, import.meta.url).href;

test('deployment schema rejects placeholders, shared IDs, unknown fields and invalid domains', () => {
  const invalid = [
    null,
    {},
    JSON.parse(readFileSync(new URL('../deployment.example.json', import.meta.url), 'utf8')),
    { ...deploymentFixture, profile: 'not-configuration' },
    { ...deploymentFixture, preview: deploymentFixture.production },
    { ...deploymentFixture, preview: { databaseId: deploymentFixture.production.databaseId } },
    { ...deploymentFixture, preview: { databaseId: getEnvironment('local').databaseId } },
    ...['https://host.dev', 'host.dev/path', 'localhost', 'startree.example.com', '-bad.dev'].map(
      (domain) => ({
        ...deploymentFixture,
        production: { ...deploymentFixture.production, domain },
      }),
    ),
  ];
  for (const value of invalid)
    assert.throws(() => parseDeploymentConfig(value), /Invalid deployment config/);
});

test('configuration derives isolated bindings and production domain from supplied deployment', async () => {
  const configuration = createConfiguration(deploymentFixture);
  const workers = await Promise.all(
    ['local', 'preview', 'production'].map(
      async (mode) => (await configuration({ mode, isPreview: false })).worker,
    ),
  );
  assert.equal(new Set(workers.map((worker) => worker.env.DB.id)).size, 3);
  assert.equal(new Set(workers.map((worker) => worker.name)).size, 3);
  assert.equal(
    new Set(workers.map((worker) => worker.env.MUTATION_RATE_LIMITER.namespace)).size,
    3,
  );
  assert.deepEqual(
    workers.map((worker) => worker.domains),
    [[], [], ['deployment.fixture.dev']],
  );
  assert.deepEqual(
    workers.map((worker) => worker.workersDev),
    [false, true, false],
  );
  assert.ok(workers.every((worker) => worker.previewUrls === false));
});

test('valid private file supplies environment IDs and the release target', () => {
  const directory = mkdtempSync(join(tmpdir(), 'startree-config-'));
  try {
    writeFileSync(join(directory, 'deployment.local.json'), JSON.stringify(deploymentFixture), {
      mode: 0o600,
    });
    const result = spawnSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `
      import assert from 'node:assert/strict';
      import { getEnvironment } from '${moduleUrl('../cloudflare.environments.ts')}';
      import { releaseIdentity, releaseSteps } from '${moduleUrl('./release-safety.mjs')}';
      assert.equal(getEnvironment('preview').databaseId, '11111111-1111-4111-8111-111111111111');
      assert.equal(getEnvironment('production').databaseId, '22222222-2222-4222-8222-222222222222');
      assert.equal(releaseIdentity('production', { versions: [{ version_id: 'test-version', percentage: 100 }] }).target, 'https://deployment.fixture.dev');
      const migrations = releaseSteps('production', 'abc1234').filter(([, args]) => args.includes('migrations'));
      assert.equal(migrations.length, 2);
      assert.ok(migrations.every(([, args]) => args.includes('22222222-2222-4222-8222-222222222222')));
    `,
      ],
      { cwd: directory, env: { ...process.env, PATH: directory }, encoding: 'utf8' },
    );
    assert.equal(result.status, 0, result.stderr);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('missing and invalid private config block all remote helpers before starting commands', () => {
  const directory = mkdtempSync(join(tmpdir(), 'startree-config-'));
  const marker = join(directory, 'command-started');
  try {
    for (const command of ['git', 'npx']) {
      writeFileSync(
        join(directory, command),
        `#!/bin/sh\nprintf started > '${marker}'\nexit 99\n`,
        { mode: 0o700 },
      );
    }
    const options = {
      cwd: directory,
      env: { ...process.env, PATH: directory },
      encoding: 'utf8',
    };
    const programs = [
      `import { cfArgs, d1Migrations, d1Query } from '${moduleUrl('./cloudflare.mjs')}'; cfArgs(['deploy'], 'production');`,
      ...['preview', 'production'].flatMap((mode) => [
        `import { d1Migrations } from '${moduleUrl('./cloudflare.mjs')}'; d1Migrations('apply', '${mode}');`,
        `import { d1Query } from '${moduleUrl('./cloudflare.mjs')}'; d1Query('SELECT 1', '${mode}');`,
        `process.argv[2] = '${mode}'; await import('${moduleUrl('./deploy.mjs')}');`,
        `import configuration from '${moduleUrl('../cloudflare.config.ts')}'; await configuration({ mode: '${mode}', isPreview: false });`,
        `import { releaseSteps } from '${moduleUrl('./release-safety.mjs')}'; releaseSteps('${mode}', 'abc1234');`,
      ]),
    ];
    for (const content of [
      undefined,
      '{broken',
      '{}',
      JSON.stringify({
        ...deploymentFixture,
        production: {
          ...deploymentFixture.production,
          databaseId: deploymentFixture.preview.databaseId,
        },
      }),
    ]) {
      if (content !== undefined) writeFileSync(join(directory, 'deployment.local.json'), content);
      for (const program of programs) {
        const result = spawnSync(process.execPath, ['--input-type=module', '-e', program], options);
        assert.equal(result.status, 1, result.stderr);
        assert.match(result.stderr, /deployment.local.json|Invalid deployment config/);
        assert.equal(existsSync(marker), false, 'No Git or Cloudflare command may start');
      }
      const local = spawnSync(
        process.execPath,
        [
          '--input-type=module',
          '-e',
          `import configuration from '${moduleUrl('../cloudflare.config.ts')}'; await configuration({ mode: 'local', isPreview: false });`,
        ],
        options,
      );
      assert.equal(local.status, 0, local.stderr);
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
