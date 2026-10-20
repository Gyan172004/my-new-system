import { beforeAll, afterAll, expect, it } from 'vitest';
import { createRuntime, type RuntimeRegistry } from '../../src/server/runtime';
import { parseRuntimeConfig } from '../../src/server/config';
import { runtimeRequestScope } from '../../src/server/request-context';
import { runtimeIdentity } from '../../src/modules/identity-profile/public';
import { runtimeDatabase } from '../../src/server/database';
import { withCandidate } from '../../src/server/identity-http';
import { allocateTestDatabase } from '../helpers/test-database';
import { runMigrations } from '../../scripts/migrate';
import { fixtureClerk, signedSession } from '../helpers/identity-tokens';
let lease: Awaited<ReturnType<typeof allocateTestDatabase>>;
const runtimes: RuntimeRegistry[] = [];
const scopes = new Map<
  RuntimeRegistry,
  ReturnType<typeof runtimeRequestScope>
>();
beforeAll(async () => {
  lease = await allocateTestDatabase({ purpose: 'migration-under-test' });
  await runMigrations({
    environment: 'test',
    migrationDatabaseUrl: lease.connectionString,
  });
}, 30000);
afterAll(async () => {
  for (const r of runtimes) await r.closeResources();
  await lease?.dispose();
}, 30000);
function runtime(
  mode: 'clerk' | 'disabled' | 'test' = 'clerk',
  url = lease.connectionString,
) {
  const r = createRuntime(
    parseRuntimeConfig({
      APP_ENV: 'test',
      LOG_LEVEL: 'silent',
      DATABASE_URL: url,
      IDENTITY_ADAPTER: mode,
      CLERK_ISSUER: fixtureClerk.issuer,
      CLERK_AUTHORIZED_PARTIES: fixtureClerk.authorizedParties.join(','),
      CLERK_PUBLISHABLE_KEY: fixtureClerk.publishableKey,
      CLERK_SECRET_KEY: fixtureClerk.secretKey,
      CLERK_JWT_KEY: fixtureClerk.jwtKey,
    }),
  );
  r.state = 'VALIDATING';
  r.state = 'INITIALIZING';
  r.state = 'SERVING';
  runtimes.push(r);
  scopes.set(r, runtimeRequestScope(r));
  return r;
}
function call(
  r: RuntimeRegistry,
  token: string | undefined,
  work: Parameters<typeof withCandidate>[1] = async (caller) =>
    Response.json(caller),
) {
  const request = new Request('http://local.test/private', {
    headers: token ? { Authorization: 'Bearer ' + token } : {},
  });
  return scopes.get(r)!.run(() => withCandidate(request, work, r), undefined, {
    sourceAddress: '127.0.0.1',
  });
}
it('uses one runtime service, preserves user mapping and canonical private response caching', async () => {
  const r = runtime();
  expect(runtimeIdentity(r)).toBe(runtimeIdentity(r));
  const first = await call(r, signedSession());
  const second = await call(r, signedSession());
  expect(first.status).toBe(200);
  expect(await second.json()).toEqual(await first.json());
  expect(first.headers.get('cache-control')).toBe('private, no-store');
  expect(first.headers.get('vary')).toBe('Authorization');
  const vary = await call(r, signedSession(), async () =>
    Response.json({}, { headers: { Vary: 'Accept' } }),
  );
  expect(vary.headers.get('vary')).toBe('Accept, Authorization');
});
it('safe denials preserve request IDs and never enter the private callback', async () => {
  const r = runtime();
  let calls = 0;
  for (const token of [
    undefined,
    'CANARY_TOKEN',
    signedSession({ sub: 'bad subject' }),
  ]) {
    await runtimeRequestScope(r).run(
      async () => {
        const id = runtimeRequestScope(r).current()!.requestId;
        const request = new Request('http://local.test/private', {
          headers: token ? { authorization: 'Bearer ' + token } : {},
        });
        const result = await withCandidate(
          request,
          async () => {
            calls++;
            return Response.json({});
          },
          r,
        );
        expect(result.status).toBe(401);
        expect(await result.json()).toMatchObject({
          requestId: id,
          retryable: false,
        });
      },
      undefined,
      { sourceAddress: '127.0.0.1' },
    );
  }
  expect(calls).toBe(0);
  const throttled = runtime();
  let last!: Response;
  for (let n = 0; n < 31; n++) last = await call(throttled, 'invalid');
  expect(last.status).toBe(429);
  expect(Number(last.headers.get('retry-after'))).toBeGreaterThan(0);
  expect((await last.json()).retryable).toBe(true);
});
it('enforces disabled accounts, sanitizes dependency/callback failures, and fails closed outside active transport', async () => {
  const r = runtime('test');
  const active = await call(r, 'test_alice');
  const caller = await active.json();
  await runtimeDatabase(r).withClient((c) =>
    c.query("UPDATE users SET account_status='disabled' WHERE id=$1", [
      caller.userId,
    ]),
  );
  expect((await call(r, 'test_alice')).status).toBe(403);
  const unknown = await call(r, 'test_bob', async () => {
    throw new Error('CANARY_DOWNSTREAM');
  });
  expect(unknown.status).toBe(503);
  expect(await unknown.text()).not.toContain('CANARY');
  expect(
    (
      await call(
        runtime('disabled', 'postgresql://127.0.0.1:1/unavailable'),
        'test_alice',
      )
    ).status,
  ).toBe(401);
  const failed = await call(
    runtime('test', 'postgresql://127.0.0.1:1/unavailable'),
    'test_bob',
  );
  expect(failed.status).toBe(503);
  expect((await failed.json()).retryable).toBe(true);
  const noContext = await withCandidate(
    new Request('http://local.test'),
    async () => Response.json({}),
    r,
  );
  expect(noContext.status).toBe(503);
  r.state = 'DRAINING';
  expect((await call(r, 'test_bob')).status).toBe(503);
  await r.closeResources();
  expect((await call(r, 'test_bob')).status).toBe(503);
});

it('propagates socket cancellation into actual downstream database work', async () => {
  const r = runtime();
  const abort = new AbortController();
  let callbackSignal: AbortSignal | undefined;
  const response = await runtimeRequestScope(r).run(
    () =>
      withCandidate(
        new Request('http://local.test/private', {
          headers: {
            authorization: 'Bearer ' + signedSession({ sub: 'user_cancel' }),
          },
        }),
        async (_caller, signal) => {
          callbackSignal = signal;
          const timer = setTimeout(() => abort.abort(), 25);
          try {
            await runtimeDatabase(r).withClient(
              (c) => c.query('SELECT pg_sleep(2)'),
              signal,
            );
            return Response.json({ unexpected: true });
          } finally {
            clearTimeout(timer);
          }
        },
        r,
      ),
    abort.signal,
    { sourceAddress: '127.0.0.1' },
  );
  expect(callbackSignal).toBeInstanceOf(AbortSignal);
  expect(callbackSignal?.aborted).toBe(true);
  expect(response.status).toBe(503);
  const started = performance.now();
  let active = 1;
  while (active && performance.now() - started < 1200) {
    const result = await runtimeDatabase(r).withClient((c) =>
      c.query(
        "SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname=current_database() AND state='active' AND query='SELECT pg_sleep(2)'",
      ),
    );
    active = result.rows[0].n;
    if (active) await new Promise((resolve) => setTimeout(resolve, 20));
  }
  expect(active).toBe(0);
  expect(performance.now() - started).toBeLessThan(1200);
});
