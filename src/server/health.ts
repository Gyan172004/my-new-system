// Process observation only: never acquire storage, providers or migration state.
export function liveness() {
  return { status: 'ok' as const, timestamp: new Date().toISOString() };
}

import type { LifecycleState } from './runtime';
export interface ReadinessInput {
  state(): LifecycleState;
  expected: readonly string[];
  deadlineMs: number;
  check(signal: AbortSignal): Promise<{ revisions: readonly string[] | null }>;
}
export async function readiness(input: ReadinessInput): Promise<{
  httpStatus: number;
  body: {
    status: 'ok' | 'unavailable';
    timestamp: string;
    checks: Record<string, 'ok' | 'unavailable' | 'skipped'>;
  };
}> {
  const result = (
    checks: Record<string, 'ok' | 'unavailable' | 'skipped'>,
    healthy = false,
  ) => ({
    httpStatus: healthy ? 200 : 503,
    body: {
      status: healthy ? ('ok' as const) : ('unavailable' as const),
      timestamp: new Date().toISOString(),
      checks,
    },
  });
  if (input.state() !== 'SERVING')
    return result({ application: 'unavailable' });
  const abort = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const observation = await Promise.race([
      Promise.resolve().then(() => input.check(abort.signal)),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          abort.abort();
          reject(new Error('readiness_deadline'));
        }, input.deadlineMs);
      }),
    ]);
    if (input.state() !== 'SERVING')
      return result({ application: 'unavailable' });
    const compatible =
      observation.revisions !== null &&
      observation.revisions.length === input.expected.length &&
      observation.revisions.every(
        (name, index) => name === input.expected[index],
      );
    return result(
      {
        application: 'ok',
        database: 'ok',
        schema: compatible ? 'ok' : 'unavailable',
      },
      compatible,
    );
  } catch {
    return result(
      input.state() === 'SERVING'
        ? { application: 'ok', database: 'unavailable', schema: 'skipped' }
        : { application: 'unavailable' },
    );
  } finally {
    clearTimeout(timer);
    abort.abort();
  }
}
