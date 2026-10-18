import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { writeFile, rm } from 'node:fs/promises';
import { expect, it } from 'vitest';
async function scan() {
  return new Promise<{ code: number | null; output: string }>(
    (resolve, reject) => {
      const child = spawn(
        process.execPath,
        ['--import', 'tsx', 'scripts/security.ts', 'secrets'],
        { stdio: ['ignore', 'pipe', 'pipe'] },
      );
      let output = '';
      child.stdout.on('data', (b) => (output += b));
      child.stderr.on('data', (b) => (output += b));
      child.once('error', reject);
      child.once('close', (code) => resolve({ code, output }));
    },
  );
}
it('detects a planted secret in source and redacts its value from scanner output', async () => {
  const file = '.foundation-secret-scan-control';
  const canary = 'ghp_' + randomBytes(18).toString('hex');
  await writeFile(file, `token = "${canary}"\n`, { flag: 'wx', mode: 0o600 });
  try {
    const result = await scan();
    expect(result.code).not.toBe(0);
    expect(result.output).toContain('secret_scan_findings');
    expect(result.output).not.toContain(canary);
  } finally {
    await rm(file);
  }
}, 120000);
