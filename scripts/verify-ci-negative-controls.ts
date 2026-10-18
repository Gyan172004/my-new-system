import { cp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createProcessProject } from '../tests/helpers/process';
import { command } from './verify-ci';
async function main() {
  if (process.argv.length !== 2)
    throw new Error('negative_control_arguments_invalid');
  const project = await createProcessProject();
  try {
    for (const file of [
      'eslint.config.mjs',
      'vitest.config.ts',
      '.dependency-cruiser.cjs',
    ])
      await cp(resolve(file), join(project.root, file));
    await mkdir(join(project.root, 'tests/unit'), { recursive: true });
    const unit = join(project.root, 'tests/unit/negative-control.test.ts');
    const passing =
      "import {expect,it} from 'vitest';it('control',()=>expect(1).toBe(1));\n";
    await writeFile(unit, passing);
    const controls = [
      {
        name: 'unit',
        diagnostic: 'AssertionError',
        args: ['run', 'test:unit'],
        file: unit,
        bad: passing.replace('toBe(1)', 'toBe(2)'),
        restore: passing,
      },
      {
        name: 'lint',
        diagnostic: '@typescript-eslint/no-unused-vars',
        args: ['run', 'lint'],
        file: join(project.root, 'src/negative-control.ts'),
        bad: 'const unused = 1;\n',
        restore: undefined,
      },
      {
        name: 'boundary',
        diagnostic: 'module-public-interface-external',
        args: ['run', 'check:architecture'],
        file: join(project.root, 'src/negative-control.ts'),
        bad: "import './modules/interview/persistence/negative-control';\n",
        restore: undefined,
      },
    ];
    await mkdir(join(project.root, 'src/modules/interview/persistence'), {
      recursive: true,
    });
    await writeFile(
      join(
        project.root,
        'src/modules/interview/persistence/negative-control.ts',
      ),
      'export {};\n',
    );
    for (const control of controls) {
      if (
        (await command('npm', control.args, {
          cwd: project.root,
          quiet: true,
          timeoutMs: 60000,
        })) !== 0
      )
        throw new Error(`negative_control_${control.name}_baseline_failed`);
      await writeFile(control.file, control.bad);
      try {
        const child = project.run(['--run', control.args.at(-1)!]);
        const code = await project.deadline(child.done, 60000);
        if (code === 0 || !child.output().includes(control.diagnostic))
          throw new Error(
            `negative_control_${control.name}_undetected_or_unavailable`,
          );
      } finally {
        if (control.restore) await writeFile(control.file, control.restore);
        else await rm(control.file, { force: true });
      }
    }
    console.log(
      JSON.stringify({
        event: 'ci_negative_controls_verified',
        unit: 'rejected',
        lint: 'rejected',
        boundary: 'rejected',
      }),
    );
  } finally {
    await project.dispose();
  }
}
void main().catch((error: unknown) => {
  console.error(
    error instanceof Error &&
      /^negative_control_(unit|lint|boundary)_/.test(error.message)
      ? error.message
      : 'ci_negative_controls_failed',
  );
  process.exitCode = 1;
});
