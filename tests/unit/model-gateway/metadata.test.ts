import { afterEach, expect, it, vi } from 'vitest';
import {
  createModelGateway,
  type AdapterResult,
  type GatewayMetadata,
} from '../../../src/modules/model-gateway/public';
import {
  summarizeUsage,
  type AttemptMetadata,
} from '../../../src/modules/model-gateway/application/metadata';
import { probeContext, probeInput } from '../../fixtures/model-gateway/probe';
const request = () => ({
  operation: 'gateway_probe' as const,
  input: probeInput,
  context: probeContext,
  signal: new AbortController().signal,
});
const complete = {
  status: 'complete',
  text: '{"schemaVersion":1,"acknowledged":true}',
  reportedModel: 'fake-probe-v1',
  usage: null,
} as const;
afterEach(() => vi.useRealTimers());
it('emits exactly one sanitized zero-attempt summary even for unknown operations', async () => {
  const summaries: GatewayMetadata[] = [];
  const gateway = createModelGateway({
    onCompleted: (m) => {
      summaries.push(m);
    },
    adapter: {
      provider: 'fake',
      async send() {
        return complete;
      },
    },
  });
  const result = await gateway.invoke({
    ...request(),
    operation: 'SECRET_CANARY',
  } as never);
  expect(result).toMatchObject({
    code: 'unsupported_operation',
    metadata: {
      operation: 'unknown',
      provider: null,
      promptVersion: null,
      attempts: 0,
      usage: {
        completeness: 'unknown',
        attempts: [],
        totals: { inputTokens: null, outputTokens: null, totalTokens: null },
      },
      estimatedCostUsd: null,
      costCompleteness: 'unknown',
      rateCardVersion: null,
    },
  });
  expect(summaries).toHaveLength(1);
  expect(summaries[0]).toBe(result.metadata);
  expect(JSON.stringify(summaries)).not.toContain('CANARY');
});
it('normalizes reasoning and cached tokens as included subtotals without charging or counting twice', async () => {
  const result = await createModelGateway({
    rateCard: {
      version: 'reviewed-v1',
      reviewed: true,
      model: 'fake-probe-v1',
      inputUsdPerMillion: 2,
      outputUsdPerMillion: 4,
      cachedInputUsdPerMillion: 1,
    },
    adapter: {
      provider: 'fake',
      async send() {
        return {
          ...complete,
          usage: {
            inputTokens: 100,
            outputTokens: 50,
            totalTokens: 150,
            cachedInputTokens: 20,
            reasoningTokens: 30,
            privateBody: 'SECRET_CANARY',
          },
        };
      },
    },
  }).invoke(request());
  expect(result).toMatchObject({
    ok: true,
    metadata: {
      usage: {
        completeness: 'complete',
        unknownAttempts: 0,
        partialAttempts: 0,
        totals: {
          inputTokens: 100,
          outputTokens: 50,
          totalTokens: 150,
          cachedInputTokens: 20,
          reasoningTokens: 30,
        },
        attempts: [
          {
            attempt: 1,
            usage: {
              completeness: 'complete',
              inputTokens: 100,
              outputTokens: 50,
              totalTokens: 150,
              cachedInputTokens: 20,
              reasoningTokens: 30,
            },
            outcome: 'success',
          },
        ],
      },
      estimatedCostUsd: 0.00038,
      costCompleteness: 'complete',
      rateCardVersion: 'reviewed-v1',
      actualCharge: 'unknown',
    },
  });
  expect(JSON.stringify(result)).not.toContain('CANARY');
});
it('retains partial usage from failed attempts and marks missing attempt totals as unknown', async () => {
  vi.useFakeTimers();
  let sends = 0;
  const result = createModelGateway({
    adapter: {
      provider: 'fake',
      async send() {
        sends++;
        return sends === 1
          ? {
              status: 'failure',
              code: 'provider_unavailable',
              retryable: true,
              internalRetry: true,
              usage: { inputTokens: 10, outputTokens: null },
            }
          : { ...complete, usage: { inputTokens: 20, outputTokens: 5 } };
      },
    },
  }).invoke(request());
  await vi.advanceTimersByTimeAsync(500);
  expect(await result).toMatchObject({
    metadata: {
      attempts: 2,
      usage: {
        completeness: 'partial',
        unknownAttempts: 0,
        partialAttempts: 1,
        totals: { inputTokens: 30, outputTokens: 5, totalTokens: 25 },
        attempts: [
          {
            attempt: 1,
            usage: {
              completeness: 'partial',
              inputTokens: 10,
              outputTokens: null,
            },
          },
          {
            attempt: 2,
            usage: {
              completeness: 'complete',
              inputTokens: 20,
              outputTokens: 5,
              totalTokens: 25,
            },
          },
        ],
      },
      estimatedCostUsd: null,
      costCompleteness: 'unknown',
    },
  });
});
it.each([
  null,
  {},
  { inputTokens: -1, outputTokens: NaN, totalTokens: Infinity },
  { inputTokens: '1', outputTokens: 0.5 },
])(
  'keeps absent/invalid usage unknown rather than inventing zero: %s',
  async (usage) => {
    const result = await createModelGateway({
      adapter: {
        provider: 'fake',
        async send() {
          return { ...complete, usage };
        },
      },
    }).invoke(request());
    expect(result.metadata).toMatchObject({
      usage: {
        completeness: 'unknown',
        unknownAttempts: 1,
        totals: { inputTokens: null, outputTokens: null, totalTokens: null },
      },
      estimatedCostUsd: null,
      actualCharge: 'unknown',
    });
  },
);
it('rejects contradictory subtotal fields and retains safe known input/output counts', async () => {
  const result = await createModelGateway({
    adapter: {
      provider: 'fake',
      async send() {
        return {
          ...complete,
          usage: {
            inputTokens: 10,
            outputTokens: 5,
            totalTokens: 999,
            cachedInputTokens: 11,
            reasoningTokens: 6,
          },
        };
      },
    },
  }).invoke(request());
  expect(result.metadata).toMatchObject({
    usage: {
      completeness: 'partial',
      totals: {
        inputTokens: 10,
        outputTokens: 5,
        totalTokens: null,
        cachedInputTokens: null,
        reasoningTokens: null,
      },
    },
  });
});
it('retains available usage on refused and invalid output without exposing body', async () => {
  for (const response of [
    { status: 'refused', usage: { inputTokens: 2, outputTokens: 3 } },
    {
      ...complete,
      text: 'SECRET_CANARY',
      usage: { inputTokens: 4, outputTokens: 1 },
    },
  ] satisfies AdapterResult[]) {
    const result = await createModelGateway({
      adapter: {
        provider: 'fake',
        async send() {
          return response;
        },
      },
    }).invoke(request());
    expect(result.metadata).toMatchObject({
      usage: {
        completeness: 'complete',
        attempts: [{ usage: { totalTokens: 5 } }],
      },
    });
    expect(JSON.stringify(result)).not.toContain('CANARY');
  }
});
it('rejects completion usage beyond token cap without retry', async () => {
  const result = await createModelGateway({
    adapter: {
      provider: 'fake',
      async send() {
        return { ...complete, usage: { inputTokens: 10, outputTokens: 1025 } };
      },
    },
  }).invoke(request());
  expect(result).toMatchObject({
    code: 'output_limit',
    metadata: { attempts: 1, usage: { totals: { outputTokens: 1025 } } },
  });
});
it('bounds successful adapter text even when adapter bypasses HTTP transport', async () => {
  const result = await createModelGateway({
    adapter: {
      provider: 'fake',
      async send() {
        return { ...complete, text: ' '.repeat(131073) + complete.text };
      },
    },
  }).invoke(request());
  expect(result).toMatchObject({
    code: 'output_limit',
    metadata: { attempts: 1 },
  });
});
it('keeps timed-out attempt usage unknown and ignores late reported usage', async () => {
  vi.useFakeTimers();
  let late!: (r: AdapterResult) => void;
  let sends = 0;
  const result = createModelGateway({
    adapter: {
      provider: 'fake',
      async send() {
        sends++;
        return sends === 1
          ? new Promise((r) => {
              late = r;
            })
          : { ...complete, usage: { inputTokens: 5, outputTokens: 1 } };
      },
    },
  }).invoke(request());
  await vi.advanceTimersByTimeAsync(6500);
  const finished = await result;
  late({ ...complete, usage: { inputTokens: 999, outputTokens: 999 } });
  await vi.advanceTimersByTimeAsync(0);
  expect(finished.metadata).toMatchObject({
    usage: {
      completeness: 'partial',
      unknownAttempts: 1,
      totals: { inputTokens: 5, outputTokens: 1, totalTokens: 6 },
    },
    costCompleteness: 'unknown',
  });
});
it('marks aggregate completeness partial, not complete, when individually complete attempts overflow a safe aggregate total', () => {
  const big = Number.MAX_SAFE_INTEGER - 1;
  const attempt = (id: string): AttemptMetadata => ({
    attempt: 1,
    attemptId: id,
    durationMs: 1,
    outcome: 'success',
    estimatedCostUsd: null,
    usage: {
      inputTokens: big,
      outputTokens: 1,
      totalTokens: big + 1,
      reasoningTokens: null,
      cachedInputTokens: null,
      completeness: 'complete',
    },
  });
  const usage = summarizeUsage([attempt('a1'), attempt('a2')]);
  expect(usage.unknownAttempts).toBe(0);
  expect(usage.partialAttempts).toBe(0);
  expect(usage.completeness).toBe('partial');
  expect(usage.totals.inputTokens).toBeNull();
  expect(usage.totals.outputTokens).toBe(2);
});
