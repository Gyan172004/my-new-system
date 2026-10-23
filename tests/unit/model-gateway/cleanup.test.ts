import { afterEach, expect, it, vi } from 'vitest';
import {
  createModelGateway,
  type AdapterResult,
} from '../../../src/modules/model-gateway/public';
import { probeInput, probeContext } from '../../fixtures/model-gateway/probe';
const request = () => ({
  operation: 'gateway_probe' as const,
  input: probeInput,
  context: probeContext,
  signal: new AbortController().signal,
});
const complete = {
  status: 'complete',
  text: '{"schemaVersion":1,"acknowledged":true}',
  reportedModel: null,
  usage: null,
} as const;
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});
it('caller cancellation beats simultaneous total timeout and late success; finalizes only once', async () => {
  vi.useFakeTimers();
  const controller = new AbortController();
  let late!: (value: AdapterResult) => void;
  const summaries: unknown[] = [];
  const gateway = createModelGateway({
    onCompleted: (m) => {
      summaries.push(m);
    },
    adapter: {
      provider: 'fake',
      send: async () =>
        new Promise((r) => {
          late = r;
        }),
    },
  });
  const result = gateway.invoke({ ...request(), signal: controller.signal });
  await vi.advanceTimersByTimeAsync(0);
  controller.abort('SECRET');
  late(complete);
  await vi.advanceTimersByTimeAsync(15000);
  expect(await result).toMatchObject({
    code: 'cancelled',
    metadata: { attempts: 1 },
  });
  expect(summaries).toHaveLength(1);
  expect(vi.getTimerCount()).toBe(0);
  expect(JSON.stringify(summaries)).not.toContain('SECRET');
});
it('total timeout bounds hung preparation at zero attempts and frees admission', async () => {
  vi.useFakeTimers();
  let preparing = 0;
  const gateway = createModelGateway({
    adapter: {
      provider: 'fake',
      async prepare() {
        preparing++;
        if (preparing === 1) return new Promise(() => {});
        return { inputTokenUpperBound: null, send: async () => complete };
      },
      async send() {
        return complete;
      },
    },
  });
  const result = gateway.invoke(request());
  await vi.advanceTimersByTimeAsync(15000);
  expect(await result).toMatchObject({
    code: 'timeout',
    metadata: { attempts: 0 },
  });
  expect(await gateway.invoke(request())).toMatchObject({ ok: true });
  expect(vi.getTimerCount()).toBe(0);
});
it('preparation and backoff exceptions are safe configuration failures and release resources', async () => {
  vi.useFakeTimers();
  let calls = 0;
  const gateway = createModelGateway({
    adapter: {
      provider: 'fake',
      async prepare() {
        calls++;
        if (calls === 1) throw Error('SECRET');
        return {
          inputTokenUpperBound: null,
          send: async () => {
            vi.spyOn(globalThis, 'setTimeout').mockImplementationOnce(() => {
              throw Error('SECRET');
            });
            return {
              status: 'failure',
              code: 'timeout',
              retryable: true,
              internalRetry: true,
            };
          },
        };
      },
      async send() {
        return complete;
      },
    },
  });
  expect(await gateway.invoke(request())).toMatchObject({
    code: 'configuration_error',
    metadata: { attempts: 0 },
  });
  const failed = await gateway.invoke(request());
  expect(failed).toMatchObject({
    code: 'configuration_error',
    metadata: { attempts: 1 },
  });
  expect(JSON.stringify(failed)).not.toContain('SECRET');
  expect(vi.getTimerCount()).toBe(0);
});
it('shutdown cancels uncooperative work and future calls, and closes adapter resources', async () => {
  let closed = false;
  const gateway = createModelGateway({
    adapter: {
      provider: 'fake',
      send: async () => new Promise(() => {}),
      async close() {
        closed = true;
      },
    },
  });
  const result = gateway.invoke(request());
  await gateway.close();
  expect(await result).toMatchObject({ code: 'cancelled' });
  expect(await gateway.invoke(request())).toMatchObject({
    code: 'cancelled',
    metadata: { attempts: 0 },
  });
  expect(closed).toBe(true);
});
it('cleanup and telemetry exceptions cannot replace a successful result', async () => {
  const gateway = createModelGateway({
    onCompleted() {
      throw Error('SECRET');
    },
    adapter: {
      provider: 'fake',
      async send(_r, signal) {
        signal.removeEventListener = () => {
          throw Error('SECRET');
        };
        return complete;
      },
    },
  });
  expect(await gateway.invoke(request())).toMatchObject({
    ok: true,
    metadata: { outcome: 'success' },
  });
});
it('unwinds scope setup failure without leaking a deadline timer or admission', async () => {
  vi.useFakeTimers();
  const bad = new AbortController();
  bad.signal.addEventListener = () => {
    throw Error('SECRET_CANARY');
  };
  const gateway = createModelGateway({
    adapter: {
      provider: 'fake',
      async send() {
        return complete;
      },
    },
  });
  expect(
    await gateway.invoke({ ...request(), signal: bad.signal }),
  ).toMatchObject({ code: 'configuration_error', metadata: { attempts: 0 } });
  expect(vi.getTimerCount()).toBe(0);
  expect(await gateway.invoke(request())).toMatchObject({ ok: true });
});
it('releases admission before invoking completion telemetry, including reentrant calls', async () => {
  const nested: Promise<unknown>[] = [];
  let observed = 0;
  const gateway = createModelGateway({
    onCompleted() {
      if (++observed === 1)
        nested.push(gateway.invoke(request()), gateway.invoke(request()));
    },
    adapter: {
      provider: 'fake',
      async send() {
        return complete;
      },
    },
  });
  expect(await gateway.invoke(request())).toMatchObject({ ok: true });
  expect(await Promise.all(nested)).toMatchObject([{ ok: true }, { ok: true }]);
});
it('cancels hung preparation on external runtime shutdown and ignores its late prepared dispatch', async () => {
  const shutdown = new AbortController();
  let release!: (prepared: {
    inputTokenUpperBound: null;
    send: () => Promise<typeof complete>;
  }) => void;
  let sends = 0;
  const gateway = createModelGateway({
    signal: shutdown.signal,
    adapter: {
      provider: 'fake',
      async prepare() {
        return new Promise((resolve) => {
          release = resolve;
        });
      },
      async send() {
        sends++;
        return complete;
      },
    },
  });
  const result = gateway.invoke(request());
  await new Promise<void>((resolve) => setImmediate(resolve));
  shutdown.abort();
  expect(await result).toMatchObject({
    code: 'cancelled',
    metadata: { attempts: 0 },
  });
  release({
    inputTokenUpperBound: null,
    send: async () => {
      sends++;
      return complete;
    },
  });
  await new Promise<void>((resolve) => setImmediate(resolve));
  expect(sends).toBe(0);
});
