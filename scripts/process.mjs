import { spawnSync } from 'node:child_process';

export const run = (command, args, options = {}) => {
  if (process.platform === 'win32') {
    throw new Error(
      'Native Windows is unsupported. Run in WSL with Linux Node.js and npm installed inside WSL, not Windows executables.',
    );
  }

  const result = spawnSync(command, args, {
    cwd: new URL('..', import.meta.url),
    encoding: 'utf8',
    stdio: options.capture ? 'pipe' : 'inherit',
    ...options,
  });

  if (result.error) {
    const code = result.error.code ?? 'UNKNOWN';
    // Node's raw spawn error includes spawnargs, which may contain credentials.
    const cause = Object.assign(new Error(`Process creation failed (${code})`), { code });
    throw Object.assign(new Error(`${command} could not start (${code})`, { cause }), {
      code,
    });
  }

  if (result.status !== 0) {
    if (options.capture) {
      process.stderr.write(result.stdout ?? '');
      process.stderr.write(result.stderr ?? '');
    }
    throw new Error(`${command} failed with status ${result.status ?? 'unknown'}`);
  }

  return result.stdout?.trim() ?? '';
};
