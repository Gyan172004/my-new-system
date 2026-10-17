import { spawnSync } from 'node:child_process';
import { expect, it } from 'vitest';

function check(overrides: Record<string, string>) {
  return spawnSync(
    process.execPath,
    ['--import', 'tsx', 'scripts/check-config.ts'],
    {
      env: { PATH: process.env.PATH, NODE_ENV: 'test', ...overrides },
      encoding: 'utf8',
      timeout: 4000,
    },
  );
}
it('config command validates successfully without connecting or printing the target', () => {
  const result = check({
    APP_ENV: 'development',
    DATABASE_URL: 'postgresql://unreachable.invalid/app',
  });
  expect(result.error).toBeUndefined();
  expect(result.status).toBe(0);
  expect(result.stdout).toBe('configuration_valid\n');
  expect(result.stderr).toBe('');
});
it('config command exits nonzero with safe key names for malformed secrets', () => {
  const result = check({
    APP_ENV: 'development',
    DATABASE_URL: 'CANARY_PRIVATE_TARGET',
  });
  expect(result.error).toBeUndefined();
  expect(result.status).toBe(1);
  expect(result.stderr).toContain('DATABASE_URL');
  expect(result.stdout + result.stderr).not.toContain('CANARY_PRIVATE_TARGET');
});
