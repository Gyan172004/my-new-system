// Contract tests: proposeTurn against the real registered interview_turn
// operation (enabled by Groups 01/02), dispatched through a test-local
// adapter object implementing GatewayAdapter directly (the established
// pattern in tests/unit/model-gateway/invoke.test.ts) rather than the fixed
// gateway_probe-shaped createFakeAdapter(). No custom registry is supplied:
// the gateway's own default registry already has interview_turn enabled.

import { afterEach, expect, it, vi } from 'vitest';
import {
  createModelGateway,
  type AdapterRequest,
  type AdapterResult,
  type EnabledOperation,
  type GatewayAdapter,
  type GatewayRequest,
  type ModelGateway,
} from '../../../src/modules/model-gateway/public';
import { proposeTurn } from '../../../src/modules/interview-orchestration/public';

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

const SESSION_ID = '11111111-1111-4111-8111-111111111111';

function baseRequest(overrides: Record<string, unknown> = {}) {
  return {
    requestId: 'req-001',
    sessionId: SESSION_ID,
    turnId: 'turn-001',
    expectedSessionVersion: 1,
    currentStage: 'initial_approach' as const,
    packVersion: 'pack-v1',
    policyVersion: 'policy-v1',
    allowedHintIndex: 0,
    allowedReferenceApproachIds: ['approach-one'],
    recentTurns: [{ speaker: 'candidate' as const, text: 'hello' }],
    candidateInput: 'Here is my approach to the problem.',
    pack: {
      fields: {
        problemStatement: 'Reverse a linked list.',
        constraints: 'O(n) time, O(1) space.',
      },
      privateFields: ['HIDDEN_TEST_CANARY'],
    },
    signal: new AbortController().signal,
    ...overrides,
  };
}

function successOutput(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1 as const,
    responseText: 'Tell me more about your approach.',
    suggestedTransitionSignal: 'none' as const,
    ...overrides,
  };
}

function successAdapterResult(output: unknown): AdapterResult {
  return {
    status: 'complete',
    text: JSON.stringify(output),
    reportedModel: null,
    usage: null,
  };
}

it('flows a schema-valid success response through policy to a proposal', async () => {
  const received: AdapterRequest[] = [];
  const adapter: GatewayAdapter = {
    provider: 'fake',
    async send(request) {
      received.push(request);
      return successAdapterResult(successOutput());
    },
  };
  const gateway = createModelGateway({ adapter });
  const result = await proposeTurn({
    ...baseRequest(),
    gateway,
  });
  expect(result).toMatchObject({
    kind: 'proposal',
    proposal: {
      responseText: 'Tell me more about your approach.',
      suggestedTransitionSignal: 'none',
    },
  });
  expect(result.callMetadata).not.toBeNull();
  expect(received).toHaveLength(1);
  expect(received[0]!.operationId).toBe('interview_turn:turn-001:1');
});

it.each(['invalid_output', 'refused', 'output_limit'] as const)(
  'repairs a first-attempt %s with exactly one additional call using a different operationId, discarding the failed result',
  async (firstCode) => {
    const received: AdapterRequest[] = [];
    let call = 0;
    const firstFailure: AdapterResult =
      firstCode === 'refused'
        ? { status: 'refused' }
        : firstCode === 'output_limit'
          ? { status: 'truncated' }
          : { status: 'tool_output' };
    const adapter: GatewayAdapter = {
      provider: 'fake',
      async send(request) {
        received.push(request);
        call++;
        if (call === 1) return firstFailure;
        return successAdapterResult(successOutput());
      },
    };
    const gateway = createModelGateway({ adapter });
    const result = await proposeTurn({ ...baseRequest(), gateway });

    expect(result.kind).toBe('proposal');
    expect(received).toHaveLength(2);
    expect(received[0]!.operationId).toBe('interview_turn:turn-001:1');
    expect(received[1]!.operationId).toBe('interview_turn:turn-001:2');
    expect(received[0]!.operationId).not.toBe(received[1]!.operationId);
  },
);

it.each(['invalid_output', 'refused', 'output_limit'] as const)(
  'falls back with zero further repair when %s recurs on the second attempt',
  async (code) => {
    const received: AdapterRequest[] = [];
    const failure: AdapterResult =
      code === 'refused'
        ? { status: 'refused' }
        : code === 'output_limit'
          ? { status: 'truncated' }
          : { status: 'tool_output' };
    const adapter: GatewayAdapter = {
      provider: 'fake',
      async send(request) {
        received.push(request);
        return failure;
      },
    };
    const gateway = createModelGateway({ adapter });
    const result = await proposeTurn({ ...baseRequest(), gateway });

    const expectedReason =
      code === 'refused' ? 'gateway_refused' : 'gateway_invalid_output';
    expect(result).toMatchObject({ kind: 'fallback', reason: expectedReason });
    expect(received).toHaveLength(2);
  },
);

it('issues exactly one logical gateway call and falls back with zero repair attempts on a genuine gateway timeout', async () => {
  // Reproduces the real 'timeout' GatewayErrorCode using the exact technique
  // tests/unit/model-gateway/cleanup.test.ts's "total timeout bounds hung
  // preparation at zero attempts" case uses: hang forever inside the
  // adapter's `prepare()` hook (never resolving), then advance fake timers
  // past the operation's registered 15s total deadline. Hanging inside
  // `send()` instead does not work for this assertion: interview_turn's
  // registered limits give maxAttempts: 2 with internal-retry-on-timeout
  // enabled per attempt's own 6s scope, so a hang inside `send()` causes the
  // gateway's own internal transport retry to dispatch `send()` a second
  // time (same operationId, a gateway-internal concern, not an FR-008
  // orchestration-level repair) before the 15s total deadline is reached.
  // Hanging in `prepare()` instead fails before any attempt begins, so
  // `send()` is never reached at all (0 calls) and the gateway's own
  // zero-attempt total-timeout path fires deterministically — exactly the
  // case this test needs: a first-attempt failure code ('timeout', not one
  // of REPAIRABLE_GATEWAY_CODES) that must make proposeTurn issue only its
  // one original logical gateway.invoke() call, never a second one with a
  // new operationId.
  vi.useFakeTimers();
  let sendCalls = 0;
  let prepareCalls = 0;
  const adapter: GatewayAdapter = {
    provider: 'fake',
    async prepare() {
      prepareCalls++;
      return new Promise(() => {});
    },
    async send() {
      sendCalls++;
      return {
        status: 'complete',
        text: '{}',
        reportedModel: null,
        usage: null,
      } as AdapterResult;
    },
  };
  let invokeCalls = 0;
  const realGateway = createModelGateway({ adapter });
  const gateway: ModelGateway = {
    ...realGateway,
    invoke<K extends EnabledOperation>(request: GatewayRequest<K>) {
      invokeCalls++;
      return realGateway.invoke(request);
    },
  };
  const resultPromise = proposeTurn({ ...baseRequest(), gateway });
  await vi.advanceTimersByTimeAsync(15_000);
  const result = await resultPromise;

  expect(result).toMatchObject({ kind: 'fallback', reason: 'gateway_timeout' });
  expect(result.callMetadata).toMatchObject({
    attempts: 0,
    outcome: 'timeout',
  });
  expect(prepareCalls).toBe(1);
  expect(sendCalls).toBe(0);
  // proposeTurn itself issued exactly one logical gateway call: 'timeout' is
  // not in REPAIRABLE_GATEWAY_CODES, so the FR-008 repair loop never ran.
  expect(invokeCalls).toBe(1);
});

it("maps a non-itemized, non-repairable gateway code to gateway_unavailable via mapGatewayFailure's default branch", async () => {
  // Closes a branch-coverage gap a reviewer found: no prior test drove
  // mapGatewayFailure's `default` case (any GatewayErrorCode outside
  // {invalid_output, refused, output_limit, timeout}). provider_auth_failed
  // is a clean example: non-retryable, not in REPAIRABLE_GATEWAY_CODES, and
  // not 'timeout' — it must go straight to fallback with zero repair
  // attempts and the generic gateway_unavailable reason.
  let sendCalls = 0;
  const adapter: GatewayAdapter = {
    provider: 'fake',
    async send() {
      sendCalls++;
      return {
        status: 'failure',
        code: 'provider_auth_failed',
        retryable: false,
        internalRetry: false,
      } satisfies AdapterResult;
    },
  };
  const gateway = createModelGateway({ adapter });
  const result = await proposeTurn({ ...baseRequest(), gateway });

  expect(result).toMatchObject({
    kind: 'fallback',
    reason: 'gateway_unavailable',
  });
  expect(sendCalls).toBe(1);
});

it('returns a policy rejection as a fallback when the reference-approach ID is outside the pinned pack', async () => {
  const adapter: GatewayAdapter = {
    provider: 'fake',
    async send() {
      return successAdapterResult(
        successOutput({ matchedReferenceApproachId: 'not-in-pack-approach' }),
      );
    },
  };
  const gateway = createModelGateway({ adapter });
  const result = await proposeTurn({
    ...baseRequest({ allowedReferenceApproachIds: ['approach-one'] }),
    gateway,
  });

  expect(result).toMatchObject({
    kind: 'fallback',
    reason: 'policy_rejected',
  });
  expect(result.callMetadata).not.toBeNull();
});
