import { beforeAll, afterAll, expect, it } from 'vitest';
import { request } from 'node:http';
import {
  createProcessProject,
  availablePort,
  eventually,
  portIsFree,
  type ProcessProject,
  type ManagedChild,
} from '../helpers/process';
let project: ProcessProject;
beforeAll(async () => {
  project = await createProcessProject();
  await project.instrumentPrivacy();
  await project.command(['--run', 'build']);
}, 180000);
afterAll(async () => {
  await project?.dispose();
}, 40000);
async function start(mode: string) {
  const port = await availablePort();
  const child = project.run(['dist/server.mjs'], {
    APP_ENV: 'test',
    PORT: String(port),
    DATABASE_URL: 'postgresql://unreachable.invalid/foundation',
    FOUNDATION_FIXTURE_FAULT: mode,
  });
  await eventually(
    async () => {
      const r = await fetch(`http://127.0.0.1:${port}/api/v1/health/live`, {
        signal: AbortSignal.timeout(2000),
      });
      return r.status;
    },
    (value) => value === 200 || value === 500 || value === 503,
    60000,
  );
  return { child, port };
}
async function stop(child: ManagedChild, port: number) {
  expect(await project.stop(child)).toBe(0);
  expect(await portIsFree(port)).toBe(true);
}
function rows(child: ManagedChild) {
  return child
    .output()
    .trim()
    .split('\n')
    .filter((line) => line.startsWith('{'))
    .map((line) => JSON.parse(line));
}
it('keeps concurrent query/header/body canaries out of both streams and ignores supplied request IDs', async () => {
  const { child, port } = await start('normal');
  try {
    await Promise.all(
      Array.from({ length: 6 }, (_, i) =>
        fetch(
          `http://127.0.0.1:${port}/api/v1/health/live?token=CANARY_QUERY_${i}`,
          {
            headers: {
              authorization: 'Bearer CANARY_AUTH',
              cookie: 'CANARY_COOKIE',
              'x-request-id': 'CANARY_INPUT_ID',
            },
          },
        ).then((r) => r.text()),
      ),
    );
    await fetch(`http://127.0.0.1:${port}/CANARY_PATH?secret=CANARY_UNKNOWN`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'CANARY_BODY',
    }).then((r) => r.text());
    await stop(child, port);
    expect(child.output()).not.toContain('CANARY');
    const completed = rows(child).filter(
      (row) => row.event === 'http_completed',
    );
    expect(completed.length).toBeGreaterThanOrEqual(8);
    expect(new Set(completed.map((row) => row.requestId)).size).toBe(
      completed.length,
    );
    expect(
      completed.some(
        (row) =>
          row.route === 'unmatched' &&
          row.method === 'POST' &&
          row.status === 404,
      ),
    ).toBe(true);
  } finally {
    if (child.child.exitCode === null) await project.stop(child);
  }
}, 95000);
it('sanitizes a raw dependency exception before framework logging and returns safe health failure', async () => {
  const { child, port } = await start('throw');
  try {
    const response = await fetch(
      `http://127.0.0.1:${port}/api/v1/health/live?token=CANARY_FAULT_QUERY`,
    );
    const status = response.status;
    const text = await response.text();
    await stop(child, port);
    expect(child.output()).not.toContain('CANARY');
    expect(status).toBe(503);
    expect(JSON.parse(text)).toMatchObject({ status: 'unavailable' });
    expect(rows(child).some((row) => row.event === 'http_failed')).toBe(true);
  } finally {
    if (child.child.exitCode === null) await project.stop(child);
  }
}, 95000);
it('handles cancelled requests with a single bounded completion and clean shutdown', async () => {
  const { child, port } = await start('slow');
  try {
    await new Promise<void>((resolve) => {
      const req = request(
        {
          host: '127.0.0.1',
          port,
          path: '/api/v1/health/live?token=CANARY_CANCEL',
          headers: { authorization: 'CANARY_CANCEL_TOKEN' },
        },
        () => {},
      );
      req.on('error', () => resolve());
      req.end();
      setTimeout(() => req.destroy(), 40);
    });
    await eventually(
      async () => rows(child).filter((row) => row.status === 499).length,
      (n) => n === 1,
      2000,
    );
    await stop(child, port);
    expect(child.output()).not.toContain('CANARY');
  } finally {
    if (child.child.exitCode === null) await project.stop(child);
  }
}, 95000);
