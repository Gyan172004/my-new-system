import { writeFile, rm } from 'node:fs/promises';
import { command } from './verify-ci';
async function main() {
  if (process.argv.length !== 2)
    throw new Error('container_build_arguments_invalid');
  const file = '.env.foundation-build-canary';
  await writeFile(
    file,
    'FOUNDATION_LAYER_CANARY=foundation-build-context-canary-703b2a1d\n',
    { flag: 'wx', mode: 0o600 },
  );
  try {
    if (
      (await command('docker', [
        'build',
        '--tag',
        'my-new-system-foundation:local',
        '.',
      ])) !== 0
    )
      throw new Error('container_build_failed');
  } finally {
    await rm(file);
  }
}
void main().catch(() => {
  console.error('container_build_failed');
  process.exitCode = 1;
});
