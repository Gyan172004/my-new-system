// Real-behavior coverage for the IO-00 gateway-dispatch generalization
// (src/modules/model-gateway/application/{types,operations,invoke}.ts) as
// exercised through the `interview_turn` operation this feature registers.
// These tests drive `createModelGateway`/`invoke` directly (not through
// `proposeTurn`) because the branches below are dispatch/transport-layer
// behavior shared by every registered operation, not orchestration-policy
// behavior; `tests/contract/interview-orchestration/propose-turn.test.ts`
// already covers the policy-facing repair/fallback paths. Group 07
// (`eng_design.md` §4) explicitly measures these three gateway files'
// coverage against this feature's own test suite because `IO-00` touched
// them, so real `interview_turn`-shaped dispatch scenarios belong here
// rather than being mirrored from `tests/unit/model-gateway`.

import { afterEach, expect, it, vi } from 'vitest';
import {
  createModelGateway,
  type AdapterRequest,
  type AdapterResult,
  type GatewayAdapter,
  type GatewayRequest,
} from '../../../src/modules/model-gateway/public';
// Allowed per .dependency-cruiser.cjs: its module-boundary rule only governs
// `src/` imports, not test files; `tests/unit/model-gateway/invoke.test.ts`
// and `tests/contract/model-gateway/registry.test.ts` already import this
// same internal module directly to exercise the registry's own fail-closed
// filtering, which the two tests below mirror for the generalized (IO-00)
// dispatch this feature depends on.
import { createOperationRegistry } from '../../../src/modules/model-gateway/application/operations';

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

const CONTEXT = {
  requestId: 'req-dispatch-001',
  operationId: 'interview_turn:turn-dispatch:1',
};

function turnRequest(
  overrides: Partial<GatewayRequest<'interview_turn'>> = {},
): GatewayRequest<'interview_turn'> {
  return {
    operation: 'interview_turn',
    input: { text: 'Here is my approach.' },
    context: CONTEXT,
    signal: new AbortController().signal,
    ...overrides,
  };
}

function successResult(): AdapterResult {
  return {
    status: 'complete',
    text: JSON.stringify({
      schemaVersion: 1,
      responseText: 'Tell me more.',
      suggestedTransitionSignal: 'none',
    }),
    reportedModel: null,
    usage: null,
  };
}

it('rejects an already-cancelled caller before any dispatch, for the interview_turn operation', async () => {
  const controller = new AbortController();
  controller.abort();
  let sendCalls = 0;
  const adapter: GatewayAdapter = {
    provider: 'fake',
    async send() {
      sendCalls++;
      return successResult();
    },
  };
  const gateway = createModelGateway({ adapter });
  const result = await gateway.invoke(
    turnRequest({ signal: controller.signal }),
  );
  expect(result).toMatchObject({ ok: false, code: 'cancelled' });
  expect(sendCalls).toBe(0);
});

it('fails an unrecognized operation name with unsupported_operation (operations.ts registry boundary)', async () => {
  const adapter: GatewayAdapter = {
    provider: 'fake',
    async send() {
      return successResult();
    },
  };
  const gateway = createModelGateway({ adapter });
  const result = await gateway.invoke({
    ...turnRequest(),
    operation: 'totally_unknown_operation' as 'interview_turn',
  });
  expect(result).toMatchObject({ ok: false, code: 'unsupported_operation' });
});

it('fails a recognized but still-disabled operation with operation_disabled', async () => {
  const adapter: GatewayAdapter = {
    provider: 'fake',
    async send() {
      return successResult();
    },
  };
  const gateway = createModelGateway({ adapter });
  const result = await gateway.invoke({
    ...turnRequest(),
    operation: 'stage_classification' as 'interview_turn',
  });
  expect(result).toMatchObject({ ok: false, code: 'operation_disabled' });
});

it('rejects a request with a malformed context object', async () => {
  const adapter: GatewayAdapter = {
    provider: 'fake',
    async send() {
      return successResult();
    },
  };
  const gateway = createModelGateway({ adapter });
  const result = await gateway.invoke(
    turnRequest({ context: { requestId: '' } as never }),
  );
  expect(result).toMatchObject({ ok: false, code: 'invalid_request' });
});

it('rejects interview_turn input that fails the registered input schema', async () => {
  const adapter: GatewayAdapter = {
    provider: 'fake',
    async send() {
      return successResult();
    },
  };
  const gateway = createModelGateway({ adapter });
  const result = await gateway.invoke(turnRequest({ input: { text: '' } }));
  expect(result).toMatchObject({ ok: false, code: 'invalid_request' });
});

it('refuses a non-fake provider outside development/staging/production (configuration_error)', async () => {
  const adapter: GatewayAdapter = {
    provider: 'groq',
    async send() {
      return successResult();
    },
  };
  const gateway = createModelGateway({ adapter });
  const result = await gateway.invoke(turnRequest());
  expect(result).toMatchObject({ ok: false, code: 'configuration_error' });
});

it('rejects production-environment dispatch once the registered budget is exhausted (estimatedCostUsd stays null)', async () => {
  // interview_turn's registered limits carry estimatedCostUsd: null (no
  // reviewed per-call ceiling yet), so any production/staging dispatch must
  // fail closed on budget_exceeded rather than silently skip the check.
  const adapter: GatewayAdapter = {
    provider: 'fake',
    async send() {
      return successResult();
    },
  };
  const gateway = createModelGateway({ adapter, environment: 'production' });
  const result = await gateway.invoke(turnRequest());
  expect(result).toMatchObject({ ok: false, code: 'budget_exceeded' });
});

it('reports a reviewed rate card version and a complete cost estimate on a priced success', async () => {
  const adapter: GatewayAdapter = {
    provider: 'fake',
    async prepare(request) {
      return {
        inputTokenUpperBound: 100,
        send: () => adapter.send(request, new AbortController().signal),
      };
    },
    async send() {
      return {
        status: 'complete',
        text: JSON.stringify({
          schemaVersion: 1,
          responseText: 'Tell me more.',
          suggestedTransitionSignal: 'none',
        }),
        reportedModel: null,
        usage: { inputTokens: 100, outputTokens: 20 },
      } satisfies AdapterResult;
    },
  };
  const gateway = createModelGateway({
    adapter,
    rateCard: {
      version: 'rate-v1',
      reviewed: true,
      model: 'fake-probe-v1',
      inputUsdPerMillion: 1,
      outputUsdPerMillion: 2,
      cachedInputUsdPerMillion: 0.5,
    },
  });
  const result = await gateway.invoke(turnRequest());
  expect(result.ok).toBe(true);
  expect(result.metadata.rateCardVersion).toBe('rate-v1');
  expect(result.metadata.costCompleteness).toBe('complete');
  expect(result.metadata.estimatedCostUsd).not.toBeNull();
});

it('rejects an oversized provider response before attempting to parse it (output_limit)', async () => {
  const adapter: GatewayAdapter = {
    provider: 'fake',
    async send() {
      return {
        status: 'complete',
        text: JSON.stringify({
          schemaVersion: 1,
          responseText: 'x'.repeat(140_000),
        }),
        reportedModel: null,
        usage: null,
      } satisfies AdapterResult;
    },
  };
  const gateway = createModelGateway({ adapter });
  const result = await gateway.invoke(turnRequest());
  expect(result).toMatchObject({ ok: false, code: 'output_limit' });
});

it('maps a genuinely malformed JSON provider response to invalid_output', async () => {
  const adapter: GatewayAdapter = {
    provider: 'fake',
    async send() {
      return {
        status: 'complete',
        text: 'not valid json {{{',
        reportedModel: null,
        usage: null,
      } satisfies AdapterResult;
    },
  };
  const gateway = createModelGateway({ adapter });
  const result = await gateway.invoke(turnRequest());
  expect(result).toMatchObject({ ok: false, code: 'invalid_output' });
});

it('retries once internally on a retryable provider code and succeeds on the second attempt', async () => {
  let calls = 0;
  const received: AdapterRequest[] = [];
  const adapter: GatewayAdapter = {
    provider: 'fake',
    async send(request) {
      received.push(request);
      calls++;
      if (calls === 1)
        return {
          status: 'failure',
          code: 'rate_limited',
          retryable: true,
          internalRetry: true,
          retryAfterMs: 5,
        } satisfies AdapterResult;
      return successResult();
    },
  };
  const gateway = createModelGateway({ adapter });
  const result = await gateway.invoke(turnRequest());
  expect(result.ok).toBe(true);
  expect(calls).toBe(2);
  // The internal transport retry reuses the same logical attemptId sequence
  // (a gateway-internal concern), distinct from orchestration-level repair.
  expect(received).toHaveLength(2);
});

it('fails immediately, without internally retrying, when the provider-advised delay is too large', async () => {
  let calls = 0;
  const adapter: GatewayAdapter = {
    provider: 'fake',
    async send() {
      calls++;
      return {
        status: 'failure',
        code: 'rate_limited',
        retryable: true,
        internalRetry: true,
        retryAfterMs: 10_000,
      } satisfies AdapterResult;
    },
  };
  const gateway = createModelGateway({ adapter });
  const result = await gateway.invoke(turnRequest());
  expect(result).toMatchObject({ ok: false, code: 'rate_limited' });
  expect(calls).toBe(1);
});

it('rejects a third concurrent call once the registered maxConcurrent admission limit is saturated', async () => {
  const pending: Array<() => void> = [];
  const adapter: GatewayAdapter = {
    provider: 'fake',
    async send() {
      return new Promise<AdapterResult>((resolve) => {
        pending.push(() => resolve(successResult()));
      });
    },
  };
  const gateway = createModelGateway({ adapter });
  const first = gateway.invoke(turnRequest());
  const second = gateway.invoke(turnRequest());
  // Give both in-flight calls a turn of the microtask queue to acquire admission.
  await new Promise((resolve) => setTimeout(resolve, 10));
  const third = await gateway.invoke(turnRequest());
  expect(third).toMatchObject({
    ok: false,
    code: 'saturated',
    retryable: true,
  });
  for (const release of pending) release();
  await Promise.all([first, second]);
});

it('surfaces a mid-flight abort as a cancelled outcome rather than a thrown error', async () => {
  const controller = new AbortController();
  const adapter: GatewayAdapter = {
    provider: 'fake',
    async send() {
      return new Promise<AdapterResult>(() => {
        /* never resolves; the abort below must still settle the call. */
      });
    },
  };
  const gateway = createModelGateway({ adapter });
  const resultPromise = gateway.invoke(
    turnRequest({ signal: controller.signal }),
  );
  await new Promise((resolve) => setTimeout(resolve, 5));
  controller.abort();
  const result = await resultPromise;
  expect(result).toMatchObject({ ok: false, code: 'cancelled' });
});

it('invokes the configured onCompleted hook exactly once with the finalized call metadata', async () => {
  const completed: unknown[] = [];
  const adapter: GatewayAdapter = {
    provider: 'fake',
    async send() {
      return successResult();
    },
  };
  const gateway = createModelGateway({
    adapter,
    onCompleted: (metadata) => completed.push(metadata),
  });
  const result = await gateway.invoke(turnRequest());
  expect(result.ok).toBe(true);
  expect(completed).toHaveLength(1);
  expect(completed[0]).toMatchObject({ outcome: 'success' });
});

it('rejects a top-level request that fails the transport-envelope schema itself (not just its context)', async () => {
  const adapter: GatewayAdapter = {
    provider: 'fake',
    async send() {
      return successResult();
    },
  };
  const gateway = createModelGateway({ adapter });
  const result = await gateway.invoke({
    ...turnRequest(),
    // A non-AbortSignal value fails the request envelope's own
    // `signal: z.instanceof(AbortSignal)` check, distinct from a context-only failure.
    signal: 'not-a-signal' as unknown as AbortSignal,
  });
  expect(result).toMatchObject({ ok: false, code: 'invalid_request' });
});

it('omits the optional cachedInputUsdPerMillion rate-card field without breaking cost estimation', async () => {
  const adapter: GatewayAdapter = {
    provider: 'fake',
    async send() {
      return {
        status: 'complete',
        text: JSON.stringify({
          schemaVersion: 1,
          responseText: 'Tell me more.',
        }),
        reportedModel: null,
        usage: { inputTokens: 10, outputTokens: 5 },
      } satisfies AdapterResult;
    },
  };
  const gateway = createModelGateway({
    adapter,
    rateCard: {
      version: 'rate-v2',
      reviewed: true,
      model: 'fake-probe-v1',
      inputUsdPerMillion: 1,
      outputUsdPerMillion: 2,
    },
  });
  const result = await gateway.invoke(turnRequest());
  expect(result.ok).toBe(true);
  expect(result.metadata.estimatedCostUsd).not.toBeNull();
});

it('reports partial cost completeness when only some attempts carry a priced estimate', async () => {
  let calls = 0;
  const adapter: GatewayAdapter = {
    provider: 'fake',
    async send() {
      calls++;
      if (calls === 1)
        return {
          status: 'failure',
          code: 'rate_limited',
          retryable: true,
          internalRetry: true,
          retryAfterMs: 1,
        } satisfies AdapterResult;
      return {
        status: 'complete',
        text: JSON.stringify({
          schemaVersion: 1,
          responseText: 'Tell me more.',
        }),
        reportedModel: null,
        usage: { inputTokens: 10, outputTokens: 5 },
      } satisfies AdapterResult;
    },
  };
  const gateway = createModelGateway({
    adapter,
    rateCard: {
      version: 'rate-v3',
      reviewed: true,
      model: 'fake-probe-v1',
      inputUsdPerMillion: 1,
      outputUsdPerMillion: 2,
    },
  });
  const result = await gateway.invoke(turnRequest());
  expect(result.ok).toBe(true);
  expect(result.metadata.costCompleteness).toBe('partial');
});

it('threads an externally supplied shutdown signal into the per-call timeout scope on a success path', async () => {
  const shutdown = new AbortController();
  const adapter: GatewayAdapter = {
    provider: 'fake',
    async send() {
      return successResult();
    },
  };
  const gateway = createModelGateway({ adapter, signal: shutdown.signal });
  const result = await gateway.invoke(turnRequest());
  expect(result.ok).toBe(true);
});

it('dispatches successfully for the openai provider label in a development environment', async () => {
  const adapter: GatewayAdapter = {
    provider: 'openai',
    async send() {
      return successResult();
    },
  };
  const gateway = createModelGateway({ adapter, environment: 'development' });
  const result = await gateway.invoke(turnRequest());
  expect(result.ok).toBe(true);
  expect(result.metadata.configuredModel).toBe('gpt-6.1-sol');
});

it('exceeds the registered completion-token limit and fails with output_limit', async () => {
  const adapter: GatewayAdapter = {
    provider: 'fake',
    async send() {
      return {
        status: 'complete',
        text: JSON.stringify({
          schemaVersion: 1,
          responseText: 'Tell me more.',
        }),
        reportedModel: null,
        usage: { inputTokens: 10, outputTokens: 2000 },
      } satisfies AdapterResult;
    },
  };
  const gateway = createModelGateway({ adapter });
  const result = await gateway.invoke(turnRequest());
  expect(result).toMatchObject({ ok: false, code: 'output_limit' });
});

it('maps a schema-mismatched (but valid-JSON) provider response to invalid_output and reports a matching reportedModel', async () => {
  const adapter: GatewayAdapter = {
    provider: 'fake',
    async send() {
      return {
        status: 'complete',
        text: JSON.stringify({ unexpected: true }),
        reportedModel: 'fake-probe-v1',
        usage: null,
      } satisfies AdapterResult;
    },
  };
  const gateway = createModelGateway({ adapter });
  const result = await gateway.invoke(turnRequest());
  expect(result).toMatchObject({ ok: false, code: 'invalid_output' });
});

it('surfaces cancellation discovered right after a prepare() step completes, before dispatch', async () => {
  const controller = new AbortController();
  let sendCalls = 0;
  const adapter: GatewayAdapter = {
    provider: 'fake',
    async prepare() {
      // The caller disconnects while preparation is in flight; prepare()
      // itself still resolves normally, but the subsequent interrupted()
      // check must catch the cancellation before any dispatch occurs.
      controller.abort();
      return {
        inputTokenUpperBound: 10,
        send: (signal: AbortSignal) =>
          adapter.send(
            {
              operation: 'interview_turn',
              input: { text: 'placeholder' },
              model: 'fake-probe-v1',
              prompt: '',
              outputJsonSchema: {},
              limits: {
                requestBytes: 16_384,
                responseBytes: 131_072,
                completionTokens: 1_024,
                totalTimeoutMs: 15_000,
                attemptTimeoutMs: 6_000,
                maxAttempts: 2,
                maxConcurrent: 2,
                estimatedCostUsd: null,
              },
              callId: 'call-cancel-prepare',
              attemptId: 'attempt-cancel-prepare',
              operationId: 'interview_turn:turn-dispatch:1',
            },
            signal,
          ),
      };
    },
    async send() {
      sendCalls++;
      return successResult();
    },
  };
  const gateway = createModelGateway({ adapter });
  const result = await gateway.invoke(
    turnRequest({ signal: controller.signal }),
  );
  expect(result).toMatchObject({ ok: false, code: 'cancelled' });
  expect(sendCalls).toBe(0);
});

it('internally retries an attempt-scoped timeout and still succeeds on the second attempt', async () => {
  let calls = 0;
  const adapter: GatewayAdapter = {
    provider: 'fake',
    async send() {
      calls++;
      if (calls === 1) return new Promise<AdapterResult>(() => {});
      return successResult();
    },
  };
  const gateway = createModelGateway({ adapter });
  // interview_turn's attemptTimeoutMs is 6000ms, well inside its 15000ms
  // total deadline: the first attempt's own scope expires on a real
  // clock and the gateway internally retries, exactly as a flaky
  // provider roundtrip should.
  const result = await gateway.invoke(turnRequest());
  expect(result.ok).toBe(true);
  expect(calls).toBe(2);
}, 12_000);

it('rethrows an adapter error unrelated to abort/expiry as a configuration_error rather than crashing the call', async () => {
  const adapter: GatewayAdapter = {
    provider: 'fake',
    async send() {
      throw new Error('adapter exploded unexpectedly');
    },
  };
  const gateway = createModelGateway({ adapter });
  const result = await gateway.invoke(turnRequest());
  expect(result).toMatchObject({ ok: false, code: 'configuration_error' });
});

it("createOperationRegistry fails a malformed candidate closed rather than registering it (IO-00's generalized filter)", () => {
  const malformed = {
    name: 'interview_turn',
    enabled: true,
    // Deliberately missing every other required field from definitionSchema.
  };
  const registry = createOperationRegistry([malformed]);
  expect(registry.resolve('interview_turn')).toMatchObject({
    ok: false,
    code: 'operation_disabled',
  });
});

it('registers neither candidate when two otherwise-valid definitions claim the same operation name', () => {
  const canonical = createOperationRegistry();
  const probeResolved = canonical.resolve('gateway_probe');
  const turnResolved = canonical.resolve('interview_turn');
  expect(probeResolved.ok).toBe(true);
  expect(turnResolved.ok).toBe(true);
  if (!probeResolved.ok || !turnResolved.ok)
    throw new Error('unreachable: canonical registry must register both');
  // Two independently valid definitions that happen to share a name:
  // relabel interview_turn's own valid definition as "gateway_probe" so it
  // collides with the real gateway_probe definition under the same name.
  const duplicateName = { ...turnResolved.definition, name: 'gateway_probe' };
  const ambiguousRegistry = createOperationRegistry([
    probeResolved.definition,
    duplicateName,
  ]);
  expect(ambiguousRegistry.resolve('gateway_probe')).toMatchObject({
    ok: false,
    code: 'operation_disabled',
  });
});
