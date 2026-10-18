import { randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { command } from './verify-ci';
async function main() {
  if (process.env.CI !== 'true' || process.env.APP_ENV !== 'test')
    throw new Error('ci_setup_refused');
  await mkdir('.local/foundation', { recursive: true, mode: 0o700 });
  for (const name of ['db-password', 'test-db-password'])
    await writeFile(
      `.local/foundation/${name}`,
      randomBytes(32).toString('hex'),
      { mode: 0o600, flag: 'wx' },
    );
  if (
    (await command('docker', [
      'compose',
      'up',
      '-d',
      '--wait',
      '--wait-timeout',
      '30',
      'db',
      'test-db',
    ])) !== 0
  )
    throw new Error('ci_service_unavailable');
}
void main().catch(() => {
  console.error('ci_setup_failed');
  process.exitCode = 1;
});
