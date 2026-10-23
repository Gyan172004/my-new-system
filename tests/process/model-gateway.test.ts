import { spawnSync } from 'node:child_process';
import { expect, it } from 'vitest';
it('keeps disabled gateway independent of uncached process health and clean shutdown', () => {
  const result = spawnSync(
    process.execPath,
    [
      '--import',
      'tsx',
      '--input-type=module',
      '-e',
      `
    import { Application } from './src/server/bootstrap.ts';
    import { installRuntime } from './src/server/runtime.ts';
    import { runtimeModelGateway } from './src/server/model-gateway.ts';
    import { GET } from './src/app/api/v1/health/live/route.ts';
    import { readiness } from './src/server/health.ts';
    globalThis.fetch = async () => { throw Error('CANARY_PROVIDER_NETWORK'); };
    const app = new Application({ APP_ENV: 'test', DATABASE_URL: 'postgresql://unreachable.invalid/test' }, { installRuntime, createAdapter: () => ({ prepare: async () => {}, listen: async () => {}, stopAdmission: async () => {}, close: async () => {}, forceClose() {} }) });
    await app.start();
    const live = GET();
    const ready = await readiness({ state: () => app.state, expected: [], deadlineMs: 50, check: async () => ({ revisions: [] }) });
    const disabled = runtimeModelGateway(app.runtime) === undefined;
    await app.stop();
    process.stdout.write(JSON.stringify({ disabled, live: live.status, cache: live.headers.get('cache-control'), ready: ready.httpStatus, state: app.state }));
  `,
    ],
    {
      env: { PATH: process.env.PATH, APP_ENV: 'test', NODE_ENV: 'test' },
      encoding: 'utf8',
      timeout: 5000,
    },
  );
  expect(result.error).toBeUndefined();
  expect(result.status).toBe(0);
  expect(result.stderr).toBe('');
  expect(JSON.parse(result.stdout)).toEqual({
    disabled: true,
    live: 200,
    cache: 'no-store',
    ready: 200,
    state: 'STOPPED',
  });
}, 10000);
