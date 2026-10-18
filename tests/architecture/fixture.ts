import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

export async function checkFixture(files: Record<string, string>) {
  const directory = await mkdtemp(join(tmpdir(), 'foundation-boundaries-'));
  try {
    await writeFile(
      join(directory, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: {
          moduleResolution: 'bundler',
          module: 'esnext',
          paths: { '@/*': ['./src/*'] },
        },
      }),
    );
    for (const [name, content] of Object.entries(files)) {
      const path = join(directory, name);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, content);
    }
    const result = spawnSync(
      process.execPath,
      ['--import', 'tsx', resolve('scripts/check-boundaries.ts'), directory],
      { encoding: 'utf8', timeout: 10000 },
    );
    if (result.error) throw result.error;
    return {
      exitCode: result.status,
      violations: JSON.parse(result.stdout) as Array<{
        rule: string;
        file: string;
      }>,
    };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
