import { expect, it } from 'vitest';
import { readiness } from '../../src/server/health';
const expected = ['1781654400000_foundation', '1781654400001_fixture'];
it('requires serving lifecycle and never calls storage or optional providers before initialization or during drain', async () => {
  for (const state of [
    'NEW',
    'INITIALIZING',
    'DRAINING',
    'STOPPED',
    'FAILED',
  ] as const) {
    let called = false;
    const result = await readiness({
      state: () => state,
      expected,
      deadlineMs: 50,
      check: async () => {
        called = true;
        return { revisions: expected };
      },
    });
    expect(result.httpStatus).toBe(503);
    expect(result.body.checks).toEqual({ application: 'unavailable' });
    expect(called).toBe(false);
  }
});
it('reports healthy mandatory storage and exact schema while ignoring absent optional providers', async () => {
  const result = await readiness({
    state: () => 'SERVING',
    expected,
    deadlineMs: 50,
    check: async () => ({ revisions: expected }),
  });
  expect(result.httpStatus).toBe(200);
  expect(result.body).toMatchObject({
    status: 'ok',
    checks: { application: 'ok', database: 'ok', schema: 'ok' },
  });
});
for (const revisions of [
  null,
  [],
  [expected[0]!],
  [...expected, 'unknown'],
  [...expected].reverse(),
  ['other', expected[1]!],
])
  it(`rejects absent or incompatible ordered history: ${JSON.stringify(revisions)}`, async () => {
    const result = await readiness({
      state: () => 'SERVING',
      expected,
      deadlineMs: 50,
      check: async () => ({ revisions }),
    });
    expect(result.httpStatus).toBe(503);
    expect(result.body.checks).toEqual({
      application: 'ok',
      database: 'ok',
      schema: 'unavailable',
    });
  });
it('sanitizes storage exceptions and aborts stuck work at the total deadline', async () => {
  for (const stuck of [false, true]) {
    let aborted = false;
    const result = await readiness({
      state: () => 'SERVING',
      expected,
      deadlineMs: 15,
      check: async (signal) => {
        signal.addEventListener(
          'abort',
          () => {
            aborted = true;
          },
          { once: true },
        );
        if (stuck) return new Promise<never>(() => {});
        throw new Error('CANARY_DATABASE_PASSWORD');
      },
    });
    expect(result.httpStatus).toBe(503);
    expect(result.body.checks).toEqual({
      application: 'ok',
      database: 'unavailable',
      schema: 'skipped',
    });
    expect(JSON.stringify(result)).not.toContain('CANARY');
    if (stuck) expect(aborted).toBe(true);
  }
});
it('cannot become ready again if draining starts during the dependency observation', async () => {
  let state: 'SERVING' | 'DRAINING' = 'SERVING';
  const result = await readiness({
    state: () => state,
    expected,
    deadlineMs: 50,
    check: async () => {
      state = 'DRAINING';
      return { revisions: expected };
    },
  });
  expect(result.httpStatus).toBe(503);
  expect(result.body.checks).toEqual({ application: 'unavailable' });
});
