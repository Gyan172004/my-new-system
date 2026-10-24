import { afterAll, beforeAll, expect, it } from 'vitest';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  publicationFixture,
  approvedChecklist,
} from '../../helpers/catalogue-publication';
let f: Awaited<ReturnType<typeof publicationFixture>>;
beforeAll(async () => {
  f = await publicationFixture();
}, 30000);
afterAll(async () => {
  await f?.close();
}, 30000);
it('actual operator processes verify identity, review, publish, retry and withdraw via bounded stdin', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'catalogue-operator-'));
  try {
    const pack = join(dir, 'pack.json'),
      evidence = join(dir, 'evidence.json');
    await writeFile(pack, f.raw());
    await writeFile(
      evidence,
      JSON.stringify({ decision: 'approved', checklist: approvedChecklist }),
    );
    const env = {
      ...process.env,
      APP_ENV: 'test',
      IDENTITY_ADAPTER: 'test',
      DATABASE_URL: f.config.databaseUrl,
      CONTENT_STAFF_GRANTS_JSON: JSON.stringify(f.staff.grants),
      CONTENT_STAFF_CONFIG_REVISION: 'cli-v1',
    };
    const run = (args: string[], input = 'test_bob\n') => {
      const result = spawnSync(
        process.execPath,
        ['--import', 'tsx', 'scripts/content-pack.ts', ...args],
        { env, input, encoding: 'utf8', timeout: 10000 },
      );
      expect(result.stderr).not.toContain('test_bob');
      expect(result.status, result.stderr).toBe(0);
      return JSON.parse(result.stdout) as Record<string, unknown>;
    };
    const review = run(['review', pack, evidence]);
    const receipt = run(['publish', pack, String(review.reviewId)]);
    expect(receipt.releaseId).toBeDefined();
    expect(run(['publish', pack, String(review.reviewId)])).toEqual(receipt);
    expect(
      run([
        'withdraw',
        f.pack.problemId,
        f.pack.version,
        'operator_withdrawal',
      ]),
    ).toEqual({ releaseId: receipt.releaseId, status: 'withdrawn' });
    const missing = spawnSync(
      process.execPath,
      [
        '--import',
        'tsx',
        'scripts/content-pack.ts',
        'publish',
        pack,
        String(review.reviewId),
      ],
      {
        env,
        input: 'untrusted-private-credential',
        encoding: 'utf8',
        timeout: 10000,
      },
    );
    expect(missing.status).toBe(1);
    expect(missing.stderr).toBe('unauthorized\n');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}, 30000);
