import { afterAll, beforeAll, expect, it } from 'vitest';
import { readFile, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { request } from 'node:http';
import {
  createProcessProject,
  availablePort,
  eventually,
  portIsFree,
  type ProcessProject,
} from '../helpers/process';
let project: ProcessProject;
beforeAll(async () => {
  project = await createProcessProject();
  // Test-only instrumentation stays in an owned copy, never in shipped routes.
  const boot = join(project.root, 'src/server/bootstrap.ts');
  let source = await readFile(boot, 'utf8');
  source =
    "import {appendFileSync} from 'node:fs';\n" +
    source.replace(
      'this.#runtime.state = state;',
      "{ this.#runtime.state = state; appendFileSync('lifecycle.txt',state+'\\n'); }",
    );
  await writeFile(boot, source);
  const route = join(project.root, 'src/app/api/v1/health/live/route.ts');
  source = await readFile(route, 'utf8');
  source =
    "import {writeFileSync} from 'node:fs';\n" +
    source
      .replace(
        'export function GET(): Response {',
        'export async function GET(): Promise<Response> {',
      )
      .replace(
        '  getRuntime();',
        "  getRuntime();\n  writeFileSync('admitted.txt','yes');\n  await new Promise(resolve=>setTimeout(resolve,process.env.FIXTURE_STALL === 'yes' ? 60000 : 350));",
      );
  await writeFile(route, source);
  await project.command(['--run', 'build']);
}, 180000);
afterAll(async () => {
  await project?.dispose();
}, 40000);
async function run(stall: boolean) {
  await rm(join(project.root, 'admitted.txt'), { force: true });
  const port = await availablePort();
  const child = project.run(['dist/server.mjs'], {
    APP_ENV: 'test',
    PORT: String(port),
    DATABASE_URL: 'postgresql://127.0.0.1:1/foundation',
    SHUTDOWN_TIMEOUT_MS: stall ? '250' : '30000',
    FIXTURE_STALL: stall ? 'yes' : 'no',
  });
  await eventually(
    async () => {
      const text = await readFile(join(project.root, 'lifecycle.txt'), 'utf8');
      return text.endsWith('SERVING\n');
    },
    (v) => v,
    60000,
  );
  const pending = new Promise<number>((resolve) => {
    const req = request(
      { host: '127.0.0.1', port, path: '/api/v1/health/live' },
      (res) => {
        res.resume();
        res.on('end', () => resolve(res.statusCode!));
      },
    );
    req.on('error', () => resolve(0));
    req.end();
  });
  await eventually(
    async () => await readFile(join(project.root, 'admitted.txt'), 'utf8'),
    (v) => v === 'yes',
    5000,
  );
  const started = performance.now();
  project.signal(child, 'SIGTERM');
  const exit = await project.deadline(child.done, 31000);
  const elapsed = performance.now() - started;
  return {
    exit,
    elapsed,
    status: await pending,
    closed: await portIsFree(port),
    states: await readFile(join(project.root, 'lifecycle.txt'), 'utf8'),
  };
}
it('marks draining before stopping, completes admitted work and closes its actual listener', async () => {
  const result = await run(false);
  expect(result.exit).toBe(0);
  expect(result.status).toBe(200);
  expect(result.closed).toBe(true);
  expect(result.states).toContain('DRAINING\nSTOPPED\n');
}, 95000);
it('forces a stalled real request closed and exits nonzero within the configured deadline', async () => {
  const result = await run(true);
  expect(result.exit).not.toBe(0);
  expect(result.status).toBe(0);
  expect(result.closed).toBe(true);
  expect(result.elapsed).toBeLessThan(30000);
  expect(result.states).toContain('DRAINING\nFAILED\n');
}, 95000);
