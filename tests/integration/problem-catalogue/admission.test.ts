import { afterAll, beforeAll, expect, it } from 'vitest';
import { publicationFixture } from '../../helpers/catalogue-publication';
import { catalogueGet } from '../../../src/server/catalogue-http';
import {
  createRuntime,
  type RuntimeRegistry,
} from '../../../src/server/runtime';
import { parseRuntimeConfig } from '../../../src/server/config';
import { runtimeRequestScope } from '../../../src/server/request-context';
let f: Awaited<ReturnType<typeof publicationFixture>>;
const runtimes: RuntimeRegistry[] = [];
const scopes = new WeakMap<
  RuntimeRegistry,
  ReturnType<typeof runtimeRequestScope>
>();
beforeAll(async () => {
  f = await publicationFixture();
}, 30000);
afterAll(async () => {
  for (const r of runtimes) await r.closeResources();
  await f?.close();
}, 30000);
function runtime(databaseUrl = f.config.databaseUrl) {
  const r = createRuntime(
    parseRuntimeConfig({
      APP_ENV: 'test',
      LOG_LEVEL: 'silent',
      IDENTITY_ADAPTER: 'test',
      DATABASE_URL: databaseUrl,
    }),
  );
  r.state = 'VALIDATING';
  r.state = 'INITIALIZING';
  r.state = 'SERVING';
  runtimes.push(r);
  scopes.set(r, runtimeRequestScope(r));
  return r;
}
function call(r: RuntimeRegistry, problemId?: string) {
  return scopes.get(r)!.run(
    () =>
      catalogueGet(
        new Request('http://fixture/api/v1/problems', {
          headers: { authorization: 'Bearer test_bob' },
        }),
        problemId,
        r,
      ),
    undefined,
    { sourceAddress: '127.0.0.1' },
  );
}
it('rejects malformed internal handler IDs before querying postgres', async () => {
  const r = runtime();
  for (const id of ['\ud800', '\u0000', 'é'.repeat(129), '']) {
    const response = await call(r, id);
    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe('invalid_request');
  }
  expect((await call(r, 'é'.repeat(128))).status).toBe(404);
});
it('preserves identity provider/storage outage and lifecycle unavailable semantics', async () => {
  const r = runtime('postgresql://127.0.0.1:1/unavailable');
  const failed = await call(r);
  expect(failed.status).toBe(503);
  expect(await failed.json()).toMatchObject({
    code: 'identity_unavailable',
    retryable: true,
  });
  const draining = runtime();
  draining.state = 'DRAINING';
  expect((await call(draining)).status).toBe(503);
  const noTransport = await catalogueGet(
    new Request('http://fixture/api/v1/problems'),
    undefined,
    runtime(),
  );
  expect(noTransport.status).toBe(503);
});
