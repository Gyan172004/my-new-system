import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { beforeAll, afterAll, expect, it } from 'vitest';
import {
  createProcessProject,
  availablePort,
  eventually,
  type ProcessProject,
} from '../helpers/process';
import { allocateTestDatabase } from '../helpers/test-database';
import { runMigrations } from '../../scripts/migrate';
import { fixtureClerk, signedSession } from '../helpers/identity-tokens';
let project: ProcessProject;
let lease: Awaited<ReturnType<typeof allocateTestDatabase>>;
beforeAll(async () => {
  lease = await allocateTestDatabase({ purpose: 'migration-under-test' });
  await runMigrations({
    environment: 'test',
    migrationDatabaseUrl: lease.connectionString,
  });
  project = await createProcessProject();
  const route = join(project.root, 'src/app/api/identity-fixture');
  await mkdir(route, { recursive: true });
  await writeFile(
    join(route, 'route.ts'),
    `
import {withCandidate} from '../../../server/identity-http';
import {getRuntime} from '../../../server/runtime';
import {runtimeRequestScope} from '../../../server/request-context';
export const dynamic='force-dynamic'; export const runtime='nodejs';
export async function GET(request:Request){return withCandidate(request,async caller=>Response.json({userId:caller.userId,source:runtimeRequestScope(getRuntime()).current()?.sourceAddress}));}
`,
  );
  await project.command(['--run', 'build']);
}, 180000);
afterAll(async () => {
  await project?.dispose();
  await lease?.dispose();
}, 40000);
function environment(port: number, mode = 'clerk') {
  return {
    APP_ENV: 'test',
    PORT: String(port),
    DATABASE_URL: lease.connectionString,
    IDENTITY_ADAPTER: mode,
    CLERK_ISSUER: fixtureClerk.issuer,
    CLERK_AUTHORIZED_PARTIES: fixtureClerk.authorizedParties.join(','),
    CLERK_PUBLISHABLE_KEY: fixtureClerk.publishableKey,
    CLERK_SECRET_KEY: fixtureClerk.secretKey,
    CLERK_JWT_KEY: fixtureClerk.jwtKey,
  };
}
it('returns correlated safe denials before private work, maps stable callers, and trusts the socket', async () => {
  const port = await availablePort();
  const child = project.run(['dist/server.mjs'], environment(port));
  try {
    await eventually(
      async () =>
        (await fetch(`http://127.0.0.1:${port}/api/v1/health/live`)).status,
      (s) => s === 200,
      60000,
    );
    const call = (token: string) =>
      fetch(
        `http://127.0.0.1:${port}/api/identity-fixture?token=CANARY_QUERY`,
        {
          headers: {
            authorization: 'Bearer ' + token,
            'x-forwarded-for': 'CANARY_SOURCE',
            'x-user-id': 'CANARY_OWNER',
            'x-request-id': 'CANARY_REQUEST',
            cookie: 'CANARY_COOKIE',
          },
        },
      );
    for (const token of [
      'CANARY_TOKEN',
      signedSession({ exp: 1 }),
      signedSession({ azp: 'https://foreign.example' }),
    ]) {
      const response = await call(token);
      expect(response.status).toBe(401);
      expect(response.headers.get('cache-control')).toBe('private, no-store');
      const body = await response.json();
      expect(body).toMatchObject({ code: 'unauthorized', retryable: false });
      expect(body.requestId).toMatch(/^[a-f0-9-]{36}$/);
      expect(JSON.stringify(body)).not.toContain('CANARY');
    }
    const first = await call(signedSession());
    const second = await call(signedSession());
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    const value = await first.json();
    expect(await second.json()).toEqual(value);
    expect(value).toMatchObject({ source: '127.0.0.1' });
    expect(value.userId).toMatch(/^[a-f0-9-]{36}$/);
    const other = await call(signedSession({ sub: 'user_bob' }));
    expect((await other.json()).userId).not.toBe(value.userId);
    expect(
      (await fetch(`http://127.0.0.1:${port}/api/v1/health/live`)).status,
    ).toBe(200);
    expect(await project.stop(child)).toBe(0);
    expect(child.output()).not.toMatch(
      /CANARY|user_alice|user_bob|postgres(?:ql)?:\/\//,
    );
    const completed = child
      .output()
      .split('\n')
      .filter((l) => l.startsWith('{'))
      .map((l) => JSON.parse(l));
    expect(
      completed.some(
        (row) => row.event === 'identity_denied' && row.status === 401,
      ),
    ).toBe(true);
    expect(
      completed
        .filter((row) => row.event === 'http_completed')
        .every((row) => typeof row.requestId === 'string'),
    ).toBe(true);
  } finally {
    if (child.child.exitCode === null) await project.stop(child);
  }
}, 95000);
it('denies disabled foundation identity without touching storage', async () => {
  const port = await availablePort();
  const child = project.run(['dist/server.mjs'], {
    ...environment(port, 'disabled'),
    DATABASE_URL: 'postgresql://127.0.0.1:1/unavailable',
  });
  try {
    await eventually(
      async () =>
        (await fetch(`http://127.0.0.1:${port}/api/v1/health/live`)).status,
      (s) => s === 200,
      60000,
    );
    const response = await fetch(
      `http://127.0.0.1:${port}/api/identity-fixture`,
      { headers: { authorization: 'Bearer CANARY_DISABLED' } },
    );
    expect(response.status).toBe(401);
    expect(await project.stop(child)).toBe(0);
    expect(child.output()).not.toContain('CANARY');
  } finally {
    if (child.child.exitCode === null) await project.stop(child);
  }
}, 95000);
