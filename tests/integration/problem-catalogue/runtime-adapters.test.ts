import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { Readable } from 'node:stream';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runContentCommand } from '../../../scripts/content-pack';
import { GET as list } from '../../../src/app/api/v1/problems/route';
import { GET as detail } from '../../../src/app/api/v1/problems/[problemId]/route';
import { installRuntime } from '../../../src/server/runtime';
import { runtimeRequestScope } from '../../../src/server/request-context';
import { parseRuntimeConfig } from '../../../src/server/config';
import {
  publicationFixture,
  approvedChecklist,
  auth,
} from '../../helpers/catalogue-publication';
let f: Awaited<ReturnType<typeof publicationFixture>>;
let runtime: ReturnType<typeof installRuntime>;
beforeAll(async () => {
  f = await publicationFixture();
  const review = await f.service.review(auth, f.raw(), {
    decision: 'approved',
    checklist: approvedChecklist,
  });
  await f.service.publish(auth, f.raw(), review.reviewId);
  runtime = installRuntime(
    parseRuntimeConfig({
      APP_ENV: 'test',
      IDENTITY_ADAPTER: 'test',
      LOG_LEVEL: 'silent',
      DATABASE_URL: f.config.databaseUrl,
    }),
  );
  runtime.state = 'VALIDATING';
  runtime.state = 'INITIALIZING';
  runtime.state = 'SERVING';
}, 30000);
afterAll(async () => {
  await runtime?.closeResources();
  await f?.close();
}, 30000);

it('runs configured staff commands through real identity and storage without an injected service', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'catalogue-runtime-command-'));
  const pack = join(directory, 'pack.json');
  const evidence = join(directory, 'evidence.json');
  const commandPack = structuredClone(f.pack);
  commandPack.problemId += '-command';
  commandPack.slug += '-command';
  await writeFile(pack, JSON.stringify(commandPack));
  await writeFile(
    evidence,
    JSON.stringify({ decision: 'approved', checklist: approvedChecklist }),
  );
  for (const [key, value] of Object.entries({
    APP_ENV: 'test',
    IDENTITY_ADAPTER: 'test',
    DATABASE_URL: f.config.databaseUrl,
    CONTENT_STAFF_GRANTS_JSON: JSON.stringify(f.staff.grants),
    CONTENT_STAFF_CONFIG_REVISION: 'runtime-command-v1',
    LOG_LEVEL: 'silent',
  }))
    vi.stubEnv(key, value);
  const run = (args: string[]) =>
    runContentCommand(args, { stdin: Readable.from(['test_bob\n']) });
  try {
    const review = (await run(['review', pack, evidence])) as {
      reviewId: string;
    };
    const receipt = (await run(['publish', pack, review.reviewId])) as {
      releaseId: string;
    };
    expect(receipt.releaseId).toMatch(/^[a-f0-9-]{36}$/);
    expect(await run(['publish', pack, review.reviewId])).toEqual(receipt);
    expect(
      await run([
        'withdraw',
        commandPack.problemId,
        commandPack.version,
        'operator_withdrawal',
      ]),
    ).toEqual({ releaseId: receipt.releaseId, status: 'withdrawn' });
    const stored = await f.db.withClient((c) =>
      c.query(
        'SELECT status FROM catalogue_release_availability WHERE release_id=$1',
        [receipt.releaseId],
      ),
    );
    expect(stored.rows).toEqual([{ status: 'withdrawn' }]);
    await writeFile(evidence, '{private-evidence-canary');
    await expect(run(['review', pack, evidence])).rejects.toMatchObject({
      code: 'invalid_review_evidence',
    });
    await expect(
      runContentCommand(['publish', pack, review.reviewId], {
        stdin: Readable.from(['untrusted-token']),
      }),
    ).rejects.toMatchObject({ code: 'unauthorized' });
  } finally {
    vi.unstubAllEnvs();
    await rm(directory, { recursive: true, force: true });
  }
});

it('adapts Next promise params and query strings to authenticated candidate reads', async () => {
  const request = (query = '') =>
    new Request('http://fixture/api/v1/problems' + query, {
      headers: { authorization: 'Bearer test_bob' },
    });
  const inScope = (work: () => Promise<Response>) =>
    runtimeRequestScope(runtime).run(work, undefined, {
      sourceAddress: '127.0.0.1',
    });
  const response = await inScope(() => list(request('?limit=1')));
  expect(response.status).toBe(200);
  expect((await response.json()).items).toMatchObject([
    { problemId: f.pack.problemId },
  ]);
  const found = await inScope(() =>
    detail(request(), {
      params: Promise.resolve({ problemId: f.pack.problemId }),
    }),
  );
  expect(found.status).toBe(200);
  expect(await found.json()).toMatchObject({
    problemId: f.pack.problemId,
    problemPackVersion: f.pack.version,
  });
  expect(found.headers.get('cache-control')).toBe('private, no-store');
  const unauthorized = await inScope(() =>
    list(new Request('http://fixture/api/v1/problems')),
  );
  expect(unauthorized.status).toBe(401);
  expect(await unauthorized.json()).toMatchObject({
    code: 'unauthorized',
    retryable: false,
  });
  const invalid = await inScope(() =>
    detail(request('?version=private'), {
      params: Promise.resolve({ problemId: f.pack.problemId }),
    }),
  );
  expect(invalid.status).toBe(400);
  const unknown = await inScope(() =>
    detail(request(), {
      params: Promise.resolve({ problemId: 'missing-problem' }),
    }),
  );
  expect(unknown.status).toBe(404);
});
