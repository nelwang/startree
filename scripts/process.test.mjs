import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { inspect } from 'node:util';
import test from 'node:test';
import { run } from './process.mjs';

test('spawn failures retain a safe cause and code without arguments or environment', () => {
  assert.throws(
    () =>
      run('startree-nonexistent-command', ['secret-argument'], {
        capture: true,
        env: { ...process.env, STARTREE_TEST_SECRET: 'secret-environment' },
      }),
    (error) => {
      assert.equal(error.code, 'ENOENT');
      assert.equal(error.cause.code, 'ENOENT');
      assert.match(error.message, /startree-nonexistent-command.*ENOENT/);
      assert.doesNotMatch(inspect(error), /secret-argument|secret-environment/);
      return true;
    },
  );
});

test('successful output and nonzero child exits remain distinct from spawn failures', () => {
  assert.equal(run(process.execPath, ['-e', 'console.log("ok")'], { capture: true }), 'ok');
  assert.throws(
    () => run(process.execPath, ['-e', 'process.exit(7)', 'secret-argument'], { capture: true }),
    (error) => {
      assert.match(error.message, /failed with status 7/);
      assert.equal(error.cause, undefined);
      assert.doesNotMatch(inspect(error), /secret-argument/);
      return true;
    },
  );
});

test('simulated native Windows fails before spawning with Linux-in-WSL guidance', () => {
  const result = spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `
    Object.defineProperty(process, 'platform', { value: 'win32' });
    const { run } = await import('./scripts/process.mjs');
    run('startree-nonexistent-command', ['secret-argument']);
  `,
    ],
    { encoding: 'utf8' },
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /WSL.*Linux Node.js and npm/);
  assert.doesNotMatch(result.stderr, /ENOENT|secret-argument/);
});
