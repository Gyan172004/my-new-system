import { beforeAll, afterAll, expect, it } from 'vitest';
import {
  publicationFixture,
  auth,
  approvedChecklist,
} from '../../helpers/catalogue-publication';
import {
  createProcessProject,
  availablePort,
  eventually,
  type ManagedChild,
  type ProcessProject,
} from '../../helpers/process';
let f: Awaited<ReturnType<typeof publicationFixture>>;
let project: ProcessProject;
let child: ManagedChild;
let base: string;
beforeAll(async () => {
  f = await publicationFixture();
  f.pack.interview.clarifications[0]!.answer = 'CANARY_PRIVATE_INTERVIEW';
  const review = await f.service.review(auth, f.raw(), {
    decision: 'approved',
    checklist: approvedChecklist,
  });
  await f.service.publish(auth, f.raw(), review.reviewId);
  project = await createProcessProject();
  const port = await availablePort();
  base = `http://127.0.0.1:${port}`;
  child = project.run(['--import', 'tsx', 'src/server/bootstrap.ts'], {
    NODE_ENV: 'development',
    APP_ENV: 'test',
    IDENTITY_ADAPTER: 'test',
    DATABASE_URL: f.config.databaseUrl,
    PORT: String(port),
    LOG_LEVEL: 'info',
    NEXT_TELEMETRY_DISABLED: '1',
  });
  await eventually(
    async () => {
      if (child.child.exitCode !== null) throw Error('catalogue_server_exited');
      return (await fetch(base + '/api/v1/health/live')).status;
    },
    (s) => s === 200,
    90000,
  );
}, 120000);
afterAll(async () => {
  await project?.dispose();
  await f?.close();
}, 60000);
const request = (path: string, token: string | null = 'test_bob') =>
  fetch(base + path, {
    headers: token ? { authorization: 'Bearer ' + token } : {},
  });
it('serves canonical candidate-only list/detail through actual Next handlers', async () => {
  const list = await request('/api/v1/problems');
  expect(list.status).toBe(200);
  expect(list.headers.get('cache-control')).toBe('private, no-store');
  expect(list.headers.get('vary')).toContain('Authorization');
  const body = await list.json();
  expect(body.items[0].problemId).toBe(f.pack.problemId);
  const detail = await request('/api/v1/problems/' + f.pack.problemId);
  expect(detail.status).toBe(200);
  const d = await detail.json();
  expect(d.problemPackVersion).toBe(f.pack.version);
  expect(d.latestPublishedVersion).toBe(f.pack.version);
  expect(Object.keys(d).sort()).toEqual(
    [
      'problemId',
      'title',
      'difficulty',
      'topicTags',
      'latestPublishedVersion',
      'statement',
      'constraints',
      'examples',
      'problemPackVersion',
    ].sort(),
  );
  expect(JSON.stringify(d)).not.toContain('CANARY_PRIVATE');
  expect((await request('/api/v1/problems/missing')).status).toBe(404);
}, 60000);
it('rejects malformed cursor/limit/path safely before storage, including Unicode byte bounds', async () => {
  for (const path of [
    '/api/v1/problems?limit=0',
    '/api/v1/problems?limit=1e1',
    '/api/v1/problems?limit=1&limit=2',
    '/api/v1/problems?cursor=!',
    '/api/v1/problems?cursor=' +
      Buffer.from(
        JSON.stringify({ formatVersion: 1, lastProblemId: '\u0000' }),
      ).toString('base64url'),
    '/api/v1/problems/' + encodeURIComponent('é'.repeat(129)),
    '/api/v1/problems/%00',
    '/api/v1/problems/%ED%A0%80',
    '/api/v1/problems/%FF',
    '/api/v1/problems/%ZZ',
    '/api/v1/problems/%C0%AF',
    '/api/v1/problems?CANARY_QUERY=CANARY_VALUE',
    '/api/v1/problems/' + f.pack.problemId + '?version=private',
  ]) {
    const response = await request(path);
    expect(response.status, path).toBe(400);
    const body = await response.json();
    expect(body.code).toBe('invalid_request');
    expect(body.retryable).toBe(false);
    expect(body).toHaveProperty('requestId');
  }
}, 30000);
it('preserves auth/disabled-account admission and does not conflate catalogue outage with empty data', async () => {
  expect((await request('/api/v1/problems', null)).status).toBe(401);
  expect((await request('/api/v1/problems/%FF', null)).status).toBe(401);
  await f.db.withClient((c) =>
    c.query("UPDATE users SET account_status='disabled' WHERE id=$1", [
      f.author.userId,
    ]),
  );
  try {
    expect((await request('/api/v1/problems', 'test_alice')).status).toBe(403);
    expect((await request('/api/v1/problems/%FF', 'test_alice')).status).toBe(
      403,
    );
  } finally {
    await f.db.withClient((c) =>
      c.query("UPDATE users SET account_status='active' WHERE id=$1", [
        f.author.userId,
      ]),
    );
  }
  await f.db.withClient((c) =>
    c.query(
      'ALTER TABLE catalogue_problems RENAME TO catalogue_fixture_offline',
    ),
  );
  try {
    const response = await request('/api/v1/problems');
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      code: 'catalogue_unavailable',
      retryable: true,
    });
  } finally {
    await f.db.withClient((c) =>
      c.query(
        'ALTER TABLE catalogue_fixture_offline RENAME TO catalogue_problems',
      ),
    );
  }
  expect((await request('/api/v1/problems')).status).toBe(200);
  await f.db.withClient((c) =>
    c.query('ALTER TABLE users RENAME TO catalogue_fixture_users_offline'),
  );
  try {
    const unavailable = await request('/api/v1/problems/%FF');
    expect(unavailable.status).toBe(503);
    expect(await unavailable.json()).toMatchObject({
      code: 'identity_unavailable',
      retryable: true,
    });
  } finally {
    await f.db.withClient((c) =>
      c.query('ALTER TABLE catalogue_fixture_users_offline RENAME TO users'),
    );
  }
  expect(child.output()).not.toMatch(
    /CANARY_PRIVATE|CANARY_QUERY|CANARY_VALUE/,
  );
}, 30000);
it('keeps canonical throttling and Retry-After in actual transport', async () => {
  let last!: Response;
  for (let i = 0; i < 31; i++)
    last = await request('/api/v1/problems/%FF', 'invalid');
  expect(last.status).toBe(429);
  expect(Number(last.headers.get('retry-after'))).toBeGreaterThan(0);
  expect((await last.json()).retryable).toBe(true);
}, 30000);
