import { afterEach, expect, it, vi } from 'vitest';
import {
  createModelGateway,
  type GatewayAdapter,
} from '../../../src/modules/model-gateway/public';
import {
  createOperationRegistry,
  canonicalOperations,
} from '../../../src/modules/model-gateway/application/operations';
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
  reportedModel: null,
  usage: null,
} as const;
afterEach(() => vi.useRealTimers());
it('rejects the third in-flight call immediately, then releases admission after cancellation', async () => {
  const abort = new AbortController();
  let sends = 0;
  const adapter: GatewayAdapter = {
    provider: 'fake',
    send: async () => {
      sends++;
      return sends > 2 ? complete : new Promise(() => {});
    },
  };
  const gateway = createModelGateway({ adapter });
  const a = gateway.invoke({ ...request(), signal: abort.signal });
  const b = gateway.invoke({ ...request(), signal: abort.signal });
  const third = await gateway.invoke(request());
  expect(third).toMatchObject({
    ok: false,
    code: 'saturated',
    retryable: true,
    metadata: { attempts: 0 },
  });
  expect(sends).toBe(2);
  abort.abort();
  await Promise.all([a, b]);
  expect(await gateway.invoke(request())).toMatchObject({
    ok: true,
    metadata: { attempts: 1 },
  });
  expect(sends).toBe(3);
});
it('times out an uncooperative attempt at six seconds, at most two attempts, releasing the slot', async () => {
  vi.useFakeTimers();
  let sends = 0;
  const gateway = createModelGateway({
    adapter: {
      provider: 'fake',
      async send() {
        sends++;
        return new Promise(() => {});
      },
    },
  });
  const result = gateway.invoke(request());
  await vi.advanceTimersByTimeAsync(5999);
  expect(sends).toBe(1);
  await vi.advanceTimersByTimeAsync(1);
  await vi.advanceTimersByTimeAsync(6500);
  expect(await result).toMatchObject({
    ok: false,
    code: 'timeout',
    retryable: true,
    metadata: { attempts: 2 },
  });
  expect(sends).toBe(2);
  expect(vi.getTimerCount()).toBe(0);
});
it('clips the attempt to remaining total deadline including preparation', async () => {
  vi.useFakeTimers();
  let sends = 0;
  const gateway = createModelGateway({
    adapter: {
      provider: 'fake',
      async prepare() {
        await new Promise((r) => setTimeout(r, 11000));
        return {
          inputTokenUpperBound: 100,
          send: async () => {
            sends++;
            return new Promise(() => {});
          },
        };
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
    metadata: { attempts: 1 },
  });
  expect(sends).toBe(1);
  expect(vi.getTimerCount()).toBe(0);
});
it.each([
  undefined,
  {
    version: 'reviewed-v1',
    reviewed: true,
    model: 'gpt-6.1-sol',
    inputUsdPerMillion: 1,
    outputUsdPerMillion: 2,
  },
])(
  'production fails closed without a reviewed card AND safe preparation AND positive cap',
  async (rateCard) => {
    let sends = 0;
    const gateway = createModelGateway({
      environment: 'production',
      ...(rateCard ? { rateCard } : {}),
      adapter: {
        provider: 'openai',
        async send() {
          sends++;
          return complete;
        },
      },
    });
    expect(await gateway.invoke(request())).toMatchObject({
      code: 'budget_exceeded',
      metadata: { attempts: 0 },
    });
    expect(sends).toBe(0);
  },
);
it('reserves input and all completion tokens across both attempts before production dispatch', async () => {
  let sends = 0;
  const definition = canonicalOperations[0]!;
  const registry = createOperationRegistry([
    {
      ...definition,
      limits: { ...definition.limits, estimatedCostUsd: 0.004 },
    },
  ]);
  const gateway = createModelGateway({
    environment: 'production',
    registry,
    rateCard: {
      version: 'reviewed-v1',
      reviewed: true,
      model: 'gpt-6.1-sol',
      inputUsdPerMillion: 1,
      outputUsdPerMillion: 2,
    },
    adapter: {
      provider: 'openai',
      async prepare() {
        return {
          inputTokenUpperBound: 100,
          send: async () => {
            sends++;
            return complete;
          },
        };
      },
      async send() {
        throw Error('must use prepared dispatch');
      },
    },
  });
  expect(await gateway.invoke(request())).toMatchObject({
    code: 'budget_exceeded',
    metadata: { attempts: 0 },
  });
  expect(sends).toBe(0);
});
it('admits production within the conservative cap and keeps unknown billed charge', async () => {
  let sends = 0;
  const definition = canonicalOperations[0]!;
  const gateway = createModelGateway({
    environment: 'production',
    registry: createOperationRegistry([
      {
        ...definition,
        limits: { ...definition.limits, estimatedCostUsd: 0.005 },
      },
    ]),
    rateCard: {
      version: 'reviewed-v1',
      reviewed: true,
      model: 'gpt-6.1-sol',
      inputUsdPerMillion: 1,
      outputUsdPerMillion: 2,
    },
    adapter: {
      provider: 'openai',
      async prepare() {
        return {
          inputTokenUpperBound: 100,
          send: async () => {
            sends++;
            return complete;
          },
        };
      },
      async send() {
        throw Error('must use prepared dispatch');
      },
    },
  });
  expect(await gateway.invoke(request())).toMatchObject({
    ok: true,
    metadata: {
      attempts: 1,
      reservedCostUsd: 0.004296,
      actualCharge: 'unknown',
    },
  });
  expect(sends).toBe(1);
});
it.each([null, 0, -1, Infinity, NaN, Number.MAX_SAFE_INTEGER + 1])(
  'fails closed on unsafe production token bound %s',
  async (inputTokenUpperBound) => {
    let sends = 0;
    const definition = canonicalOperations[0]!;
    const gateway = createModelGateway({
      environment: 'production',
      registry: createOperationRegistry([
        {
          ...definition,
          limits: { ...definition.limits, estimatedCostUsd: 1 },
        },
      ]),
      rateCard: {
        version: 'reviewed-v1',
        reviewed: true,
        model: 'gpt-6.1-sol',
        inputUsdPerMillion: 1,
        outputUsdPerMillion: 2,
      },
      adapter: {
        provider: 'openai',
        async prepare() {
          return {
            inputTokenUpperBound,
            send: async () => {
              sends++;
              return complete;
            },
          };
        },
        async send() {
          sends++;
          return complete;
        },
      },
    });
    expect(await gateway.invoke(request())).toMatchObject({
      code: 'budget_exceeded',
      metadata: { attempts: 0 },
    });
    expect(sends).toBe(0);
  },
);
it.each([
  { reviewed: false },
  { inputUsdPerMillion: -1 },
  { outputUsdPerMillion: Infinity },
  { cachedInputUsdPerMillion: NaN },
  { model: 'wrong' },
  { version: '' },
])('fails closed on invalid production rate card %s', async (patch) => {
  let sends = 0;
  const definition = canonicalOperations[0]!;
  const gateway = createModelGateway({
    environment: 'production',
    registry: createOperationRegistry([
      { ...definition, limits: { ...definition.limits, estimatedCostUsd: 1 } },
    ]),
    rateCard: {
      version: 'reviewed-v1',
      reviewed: true,
      model: 'gpt-6.1-sol',
      inputUsdPerMillion: 1,
      outputUsdPerMillion: 2,
      ...patch,
    },
    adapter: {
      provider: 'openai',
      async prepare() {
        return {
          inputTokenUpperBound: 100,
          send: async () => {
            sends++;
            return complete;
          },
        };
      },
      async send() {
        sends++;
        return complete;
      },
    },
  });
  expect(await gateway.invoke(request())).toMatchObject({
    code: 'budget_exceeded',
    metadata: { attempts: 0 },
  });
  expect(sends).toBe(0);
});
it('requires trusted environment for real adapters instead of defaulting to development', async () => {
  let sends = 0;
  expect(
    await createModelGateway({
      adapter: {
        provider: 'openai',
        async send() {
          sends++;
          return complete;
        },
      },
    }).invoke(request()),
  ).toMatchObject({ code: 'configuration_error', metadata: { attempts: 0 } });
  expect(sends).toBe(0);
});
it('pins the reviewed rate-card revision at construction across caller mutations before and during dispatch', async () => {
  const rateCard = {
    version: 'reviewed-v1',
    reviewed: true,
    model: 'gpt-6.1-sol',
    inputUsdPerMillion: 1,
    outputUsdPerMillion: 2,
  };
  const definition = canonicalOperations[0]!;
  let completeSend!: (result: {
    status: 'complete';
    text: string;
    reportedModel: null;
    usage: { inputTokens: number; outputTokens: number };
  }) => void;
  let dispatched!: () => void;
  const sending = new Promise<void>((resolve) => {
    dispatched = resolve;
  });
  const gateway = createModelGateway({
    environment: 'production',
    rateCard,
    registry: createOperationRegistry([
      {
        ...definition,
        limits: { ...definition.limits, estimatedCostUsd: 0.005 },
      },
    ]),
    adapter: {
      provider: 'openai',
      async prepare() {
        return {
          inputTokenUpperBound: 100,
          send: async () => {
            dispatched();
            return new Promise((resolve) => {
              completeSend = resolve;
            });
          },
        };
      },
      async send() {
        throw Error('prepared dispatch required');
      },
    },
  });
  // The caller retains its own mutable object; construction must not freeze it.
  rateCard.version = 'changed-before-dispatch';
  const result = gateway.invoke(request());
  await sending;
  rateCard.version = 'unreviewed-v2';
  rateCard.inputUsdPerMillion = 100;
  rateCard.outputUsdPerMillion = 200;
  completeSend({ ...complete, usage: { inputTokens: 100, outputTokens: 100 } });
  expect(await result).toMatchObject({
    ok: true,
    metadata: {
      reservedCostUsd: 0.004296,
      estimatedCostUsd: 0.0003,
      rateCardVersion: 'reviewed-v1',
      costCompleteness: 'complete',
    },
  });
});
