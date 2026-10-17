import { afterAll, beforeAll, expect, it } from 'vitest';
import {
  availablePort,
  createProcessProject,
  eventually,
  portIsFree,
  readLiveness,
  type ProcessProject,
} from '../helpers/process';
let project: ProcessProject;
beforeAll(async () => {
  project = await createProcessProject();
  await project.instrument();
  await project.command(['--run', 'build']);
}, 180000);
afterAll(async () => {
  await project?.dispose();
}, 40000);
it('builds without runtime secrets and serves through the bootstrap-owned registry', async () => {
  const port = await availablePort();
  const process = project.run(['dist/server.mjs'], {
    NODE_ENV: 'production',
    APP_ENV: 'test',
    DATABASE_URL: 'postgresql://unreachable.invalid/foundation',
    PORT: String(port),
  });
  try {
    const live = await eventually(
      () => readLiveness(port),
      (value) => value.status === 200,
      60000,
    );
    expect(live.cache).toBe('no-store');
    expect(live.body.status).toBe('ok');
    expect(live.body.timestamp).toMatch(/Z$/);
    expect(await project.observation()).toMatchObject({
      pid: process.child.pid,
      calls: 1,
      listeners: 1,
      sameHandle: true,
      lifecycle: 'SERVING',
    });
    expect(await project.stop(process)).toBe(0);
    expect(await portIsFree(port)).toBe(true);
  } finally {
    if (process.child.exitCode === null) await project.stop(process);
  }
}, 95000);
for (const [name, overrides, key] of [
  ['missing environment', { APP_ENV: '' }, 'APP_ENV'],
  [
    'malformed target',
    { DATABASE_URL: 'CANARY_PRIVATE_TARGET' },
    'DATABASE_URL',
  ],
  ['unimplemented identity', { IDENTITY_ADAPTER: 'clerk' }, 'IDENTITY_ADAPTER'],
  [
    'unsafe identity',
    {
      APP_ENV: 'production',
      IDENTITY_ADAPTER: 'test',
      DATABASE_URL: 'postgresql://db.invalid/foundation?sslmode=verify-full',
    },
    'IDENTITY_ADAPTER',
  ],
] as const) {
  it(`rejects ${name} before binding without printing its value`, async () => {
    const port = await availablePort();
    const process = project.run(['dist/server.mjs'], {
      NODE_ENV: 'production',
      APP_ENV: 'test',
      DATABASE_URL: 'postgresql://unreachable.invalid/foundation',
      PORT: String(port),
      ...overrides,
    });
    expect(await project.deadline(process.done, 10000)).toBe(1);
    expect(process.output()).toContain(key);
    expect(process.output()).not.toContain('CANARY_PRIVATE_TARGET');
    expect(await portIsFree(port)).toBe(true);
  }, 15000);
}
