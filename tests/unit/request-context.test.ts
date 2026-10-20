import { expect, it } from 'vitest';
import {
  createRequestScope,
  runtimeRequestScope,
} from '../../src/server/request-context';
import { createRuntime } from '../../src/server/runtime';
import { parseRuntimeConfig } from '../../src/server/config';
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
it('assigns server UUIDs and preserves concurrent async isolation with monotonic starts', async () => {
  const scope = createRequestScope();
  const ids = await Promise.all(
    [5, 1, 3].map((ms) =>
      scope.run(async () => {
        const first = scope.current()!;
        expect(first).toBeDefined();
        await wait(ms);
        expect(scope.current()).toBe(first);
        expect(first.requestId).toMatch(
          /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
        );
        expect(first.startedAt).toBeLessThanOrEqual(performance.now());
        expect(Object.isFrozen(first)).toBe(true);
        return first.requestId;
      }),
    ),
  );
  expect(new Set(ids).size).toBe(3);
  expect(scope.current()).toBeUndefined();
});
it('invalidates detached work after errors and cancellation without retaining context', async () => {
  const scope = createRequestScope();
  const controller = new AbortController();
  let detached!: Promise<unknown>;
  await expect(
    scope.run(async () => {
      expect(scope.current()).toBeDefined();
      detached = wait(15).then(() => scope.current());
      controller.abort();
      expect(scope.current()).toBeUndefined();
      throw new Error('fixture_failure');
    }, controller.signal),
  ).rejects.toThrow('fixture_failure');
  expect(await detached).toBeUndefined();
  expect(scope.current()).toBeUndefined();
});
it('clears detached work after normal completion and reuses the runtime-owned scope', async () => {
  const runtime = createRuntime(
    parseRuntimeConfig({
      APP_ENV: 'test',
      DATABASE_URL: 'postgresql://unreachable.invalid/app',
    }),
  );
  const scope = runtimeRequestScope(runtime);
  let detached!: Promise<unknown>;
  expect(runtimeRequestScope(runtime)).toBe(scope);
  await scope.run(async () => {
    detached = wait(10).then(() => scope.current());
  });
  expect(await detached).toBeUndefined();
  await runtime.closeResources();
});

it('retains only trusted socket transport and cancellation inside the active request', async () => {
  const scope = createRequestScope();
  const abort = new AbortController();
  await scope.run(
    async () => {
      expect(scope.current()).toMatchObject({
        sourceAddress: '127.0.0.1',
        signal: abort.signal,
      });
    },
    abort.signal,
    { sourceAddress: '127.0.0.1' },
  );
  expect(scope.current()).toBeUndefined();
});
