import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  createModelGateway,
  type AdapterRequest,
  type GatewayErrorCode,
} from '../../../src/modules/model-gateway/public';
import {
  canonicalOperations,
  createOperationRegistry,
} from '../../../src/modules/model-gateway/application/operations';
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
const transient = {
  status: 'failure',
  code: 'provider_unavailable',
  retryable: true,
  internalRetry: true,
} as const;
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-23T00:00:00Z'));
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});
it('waits 250–500 ms jitter, cleans each attempt before redispatch, and preserves logical identity', async () => {
  const sent: { request: AdapterRequest; signal: AbortSignal; time: number }[] =
    [];
  const gateway = createModelGateway({
    adapter: {
      provider: 'fake',
      async send(req, signal) {
        sent.push({ request: req, signal, time: Date.now() });
        return sent.length === 1 ? transient : complete;
      },
    },
  });
  const result = gateway.invoke(request());
  await vi.advanceTimersByTimeAsync(0);
  expect(sent).toHaveLength(1);
  expect(sent[0]!.signal.aborted).toBe(true);
  await vi.advanceTimersByTimeAsync(249);
  expect(sent).toHaveLength(1);
  await vi.advanceTimersByTimeAsync(251);
  expect(await result).toMatchObject({ ok: true, metadata: { attempts: 2 } });
  expect(sent).toHaveLength(2);
  expect(sent[1]!.time - sent[0]!.time).toBeGreaterThanOrEqual(250);
  expect(sent[1]!.time - sent[0]!.time).toBeLessThanOrEqual(500);
  expect(sent[1]!.request.callId).toBe(sent[0]!.request.callId);
  expect(sent[1]!.request.operationId).toBe(probeContext.operationId);
  expect(sent[1]!.request.model).toBe(sent[0]!.request.model);
  expect(sent[1]!.request.attemptId).not.toBe(sent[0]!.request.attemptId);
  expect(sent[1]!.signal.aborted).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
});
it.each(['1', 'Fri, 23 Oct 2026 00:00:01 GMT'])(
  'honors Retry-After %s without retrying early',
  async (retryAfter) => {
    let sends = 0;
    const gateway = createModelGateway({
      adapter: {
        provider: 'fake',
        async send() {
          sends++;
          return sends === 1 ? { ...transient, retryAfter } : complete;
        },
      },
    });
    const result = gateway.invoke(request());
    await vi.advanceTimersByTimeAsync(999);
    expect(sends).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(await result).toMatchObject({ ok: true, metadata: { attempts: 2 } });
  },
);
it.each(['3', 'Fri, 23 Oct 2026 00:00:05 GMT'])(
  'refuses retry rather than shortening excessive Retry-After %s',
  async (retryAfter) => {
    let sends = 0;
    const gateway = createModelGateway({
      adapter: {
        provider: 'fake',
        async send() {
          sends++;
          return { ...transient, retryAfter };
        },
      },
    });
    const result = gateway.invoke(request());
    await vi.advanceTimersByTimeAsync(2100);
    expect(await result).toMatchObject({
      code: 'provider_unavailable',
      metadata: { attempts: 1 },
    });
    expect(sends).toBe(1);
  },
);
it.each(['garbage', '-2', '1.5', 'Infinity'])(
  'uses ordinary jitter for invalid Retry-After %s',
  async (retryAfter) => {
    let sends = 0;
    const result = createModelGateway({
      adapter: {
        provider: 'fake',
        async send() {
          sends++;
          return sends === 1 ? { ...transient, retryAfter } : complete;
        },
      },
    }).invoke(request());
    await vi.advanceTimersByTimeAsync(249);
    expect(sends).toBe(1);
    await vi.advanceTimersByTimeAsync(251);
    expect(await result).toMatchObject({ ok: true });
  },
);
it('does not retry when provider delay cannot fit remaining total deadline', async () => {
  let sends = 0;
  const definition = canonicalOperations[0]!;
  const gateway = createModelGateway({
    registry: createOperationRegistry([
      { ...definition, limits: { ...definition.limits, totalTimeoutMs: 1000 } },
    ]),
    adapter: {
      provider: 'fake',
      async send() {
        sends++;
        return { ...transient, retryAfter: '1' };
      },
    },
  });
  const result = gateway.invoke(request());
  await vi.advanceTimersByTimeAsync(0);
  expect(await result).toMatchObject({
    code: 'provider_unavailable',
    metadata: { attempts: 1 },
  });
  expect(sends).toBe(1);
  expect(vi.getTimerCount()).toBe(0);
});
it.each([
  'invalid_output',
  'refused',
  'output_limit',
  'quota_exhausted',
  'provider_auth_failed',
  'invalid_request',
  'configuration_error',
  'cancelled',
] satisfies GatewayErrorCode[])(
  'never retries terminal %s even if an adapter accidentally flags it transient',
  async (code) => {
    let sends = 0;
    const result = createModelGateway({
      adapter: {
        provider: 'fake',
        async send() {
          sends++;
          return {
            status: 'failure',
            code,
            retryable: false,
            internalRetry: true,
          };
        },
      },
    }).invoke(request());
    await vi.advanceTimersByTimeAsync(1000);
    expect(await result).toMatchObject({ code, metadata: { attempts: 1 } });
    expect(sends).toBe(1);
  },
);
it('stops at two attempts for repeated transient failure', async () => {
  let sends = 0;
  const result = createModelGateway({
    adapter: {
      provider: 'fake',
      async send() {
        sends++;
        return transient;
      },
    },
  }).invoke(request());
  await vi.advanceTimersByTimeAsync(10000);
  expect(await result).toMatchObject({
    code: 'provider_unavailable',
    metadata: { attempts: 2 },
  });
  expect(sends).toBe(2);
  expect(vi.getTimerCount()).toBe(0);
});
it('does not dispatch a retry after caller abort during backoff', async () => {
  let sends = 0;
  const controller = new AbortController();
  const result = createModelGateway({
    adapter: {
      provider: 'fake',
      async send() {
        sends++;
        return transient;
      },
    },
  }).invoke({ ...request(), signal: controller.signal });
  await vi.advanceTimersByTimeAsync(1);
  controller.abort();
  expect(await result).toMatchObject({
    code: 'cancelled',
    metadata: { attempts: 1 },
  });
  await vi.advanceTimersByTimeAsync(1000);
  expect(sends).toBe(1);
  expect(vi.getTimerCount()).toBe(0);
});
