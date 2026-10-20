import { acceptedMigrations } from '../helpers/migration-chain';
import { spawn } from 'node:child_process';
import { expect, it } from 'vitest';
it('completes a clean install/build/migrate/start/outage/recovery/stop journey against owned storage', async () => {
  const result = await new Promise<{ code: number | null; output: string }>(
    (resolve, reject) => {
      const child = spawn(
        process.execPath,
        ['--import', 'tsx', 'scripts/verify-foundation.ts'],
        {
          env: { ...process.env, APP_ENV: 'test' },
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      );
      let output = '';
      child.stdout.on('data', (b) => (output += b));
      child.stderr.on('data', (b) => (output += b));
      child.once('error', reject);
      child.once('close', (code) => resolve({ code, output }));
    },
  );
  expect(result.code, result.output.slice(-1000)).toBe(0);
  const lines = result.output.trim().split('\n');
  expect(JSON.parse(lines.at(-1)!)).toEqual({
    event: 'foundation_verified',
    cleanInstall: true,
    migrated: acceptedMigrations.length,
    live: 200,
    ready: 200,
    outageReady: 503,
    recovered: 200,
    stopped: true,
  });
}, 300000);
