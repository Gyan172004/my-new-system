import { afterAll, beforeAll, expect, it } from 'vitest';
import { cp, writeFile, mkdir, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createProcessProject, type ProcessProject } from '../helpers/process';
let project: ProcessProject;
beforeAll(async () => {
  project = await createProcessProject();
  for (const name of [
    'eslint.config.mjs',
    '.dependency-cruiser.cjs',
    'vitest.config.ts',
  ])
    await cp(resolve(name), join(project.root, name));
}, 60000);
afterAll(async () => {
  await project?.dispose();
}, 40000);
it('exposes every required CI stage without silently omitting service or scanner gates', async () => {
  const child = project.run(['--run', 'verify:ci', '--', '--list']);
  expect(await project.deadline(child.done, 10000)).toBe(0);
  expect(JSON.parse(child.output())).toEqual([
    'install',
    'format',
    'lint',
    'typecheck',
    'unit',
    'integration',
    'identity-coverage',
    'contract',
    'architecture',
    'build',
    'process',
    'browser',
    'audit',
    'secrets',
    'container',
    'ci-controls',
    'image',
    'filesystem',
    'foundation',
    'negative-controls',
  ]);
});
it('runs the real lint stage, propagates its nonzero result and returns safe stage evidence', async () => {
  const good = project.run(['--run', 'verify:ci', '--', '--stage', 'lint']);
  const code = await project.deadline(good.done, 30000);
  expect(code, good.output().slice(-3000)).toBe(0);
  await writeFile(join(project.root, 'src/broken.ts'), 'const unused = 1;\n');
  try {
    const bad = project.run(['--run', 'verify:ci', '--', '--stage', 'lint']);
    expect(await project.deadline(bad.done, 30000)).not.toBe(0);
    expect(bad.output()).toContain('ci_stage_failed:lint');
  } finally {
    await writeFile(join(project.root, 'src/broken.ts'), 'export {};\n');
  }
}, 65000);
it('fails unknown stages instead of treating an unavailable check as a pass', async () => {
  const child = project.run(['--run', 'verify:ci', '--', '--stage', 'unknown']);
  expect(await project.deadline(child.done, 10000)).not.toBe(0);
  expect(child.output()).toContain('ci_arguments_invalid');
});

it('rejects a real source boundary violation even when architecture fixture tests pass', async () => {
  const directory = join(project.root, 'tests/architecture');
  const privateDirectory = join(
    project.root,
    'src/modules/interview/persistence',
  );
  await mkdir(directory, { recursive: true });
  await mkdir(privateDirectory, { recursive: true });
  await writeFile(
    join(directory, 'control.test.ts'),
    "import {it,expect} from 'vitest';it('passing fixture',()=>expect(1).toBe(1));\n",
  );
  await writeFile(join(privateDirectory, 'control.ts'), 'export {};\n');
  const violation = join(project.root, 'src/negative-boundary.ts');
  await writeFile(
    violation,
    "import './modules/interview/persistence/control';\n",
  );
  try {
    const child = project.run([
      '--run',
      'verify:ci',
      '--',
      '--stage',
      'architecture',
    ]);
    expect(await project.deadline(child.done, 30000)).not.toBe(0);
    expect(child.output()).toContain('module-public-interface-external');
  } finally {
    await rm(violation, { force: true });
  }
}, 35000);
