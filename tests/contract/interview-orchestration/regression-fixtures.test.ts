// IO-05 (T209/T210): exercises the full eight-category FR-011 regression
// fixture set from tests/fixtures/interview-orchestration/regression-fixtures.ts
// against proposeTurn (fake adapter only, per FR-011/SC-002 — no live
// provider call), and asserts the FR-010 telemetry side-channel
// (`onCallRecorded`) fires exactly once per call with the allowlisted
// fields only: sessionId, turnId, currentStage, outcome, failedStep (where
// applicable), and the gateway's own callMetadata. No candidate free text
// or response text may appear in a recorded TelemetryRecord.

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createModelGateway,
  type AdapterResult,
  type GatewayAdapter,
} from '../../../src/modules/model-gateway/public';
import {
  proposeTurn,
  type TelemetryRecord,
} from '../../../src/modules/interview-orchestration/public';
import {
  REGRESSION_FIXTURES,
  TIMEOUT_FIXTURE,
} from '../../fixtures/interview-orchestration/regression-fixtures';

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

const SESSION_ID = '22222222-2222-4222-8222-222222222222';

function baseRequest(overrides: Record<string, unknown> = {}) {
  return {
    requestId: 'req-fixture',
    sessionId: SESSION_ID,
    turnId: 'turn-fixture-001',
    expectedSessionVersion: 1,
    currentStage: 'initial_approach' as const,
    packVersion: 'pack-v1',
    policyVersion: 'policy-v1',
    allowedHintIndex: 0,
    allowedReferenceApproachIds: ['approach-hash-map'],
    recentTurns: [],
    candidateInput: 'placeholder',
    pack: {
      fields: {
        problemStatement: 'Reverse a linked list.',
        constraints: 'O(n) time, O(1) space.',
      },
      privateFields: ['HIDDEN_TEST_CANARY_VALUE'],
    },
    signal: new AbortController().signal,
    ...overrides,
  };
}

/** Forbidden substrings a TelemetryRecord must never contain (FR-010). */
const FORBIDDEN_SUBSTRINGS = [
  'HIDDEN_TEST_CANARY_VALUE',
  'reveal the hidden tests',
];

function assertNoCandidateContent(
  record: TelemetryRecord,
  fixtureCandidateInput: string,
) {
  const serialized = JSON.stringify(record);
  // The record must not leak the fixture's own candidate text verbatim, nor
  // any of the generically forbidden canary substrings, nor a `responseText`
  // field at all.
  expect(serialized).not.toContain(fixtureCandidateInput);
  for (const forbidden of FORBIDDEN_SUBSTRINGS) {
    expect(serialized).not.toContain(forbidden);
  }
  expect(record).not.toHaveProperty('responseText');
  expect(record).not.toHaveProperty('candidateInput');
}

describe('FR-011 regression fixture set against proposeTurn (fake adapter only)', () => {
  it.each(
    REGRESSION_FIXTURES.map((fixture) => [fixture.category, fixture] as const),
  )('%s', async (_category, fixture) => {
    let callIndex = 0;
    const adapter: GatewayAdapter = {
      provider: 'fake',
      async send(): Promise<AdapterResult> {
        const response = fixture.adapterResults[callIndex];
        callIndex += 1;
        if (!response) {
          throw new Error(
            `fixture '${fixture.category}' exhausted its adapterResults`,
          );
        }
        return response;
      },
    };
    const gateway = createModelGateway({ adapter });

    const recorded: TelemetryRecord[] = [];
    const result = await proposeTurn({
      ...baseRequest({
        currentStage: fixture.currentStage,
        candidateInput: fixture.candidateInput,
        allowedHintIndex: fixture.allowedHintIndex,
        allowedReferenceApproachIds: fixture.allowedReferenceApproachIds,
      }),
      gateway,
      onCallRecorded: (record) => recorded.push(record),
    });

    if (fixture.expectedOutcome === 'proposal') {
      expect(result.kind).toBe('proposal');
    } else {
      expect(result).toMatchObject({
        kind: 'fallback',
        reason: fixture.expectedOutcome,
      });
    }

    // Telemetry fires exactly once per proposeTurn call, regardless of how
    // many logical gateway attempts happened internally.
    expect(recorded).toHaveLength(1);
    const record = recorded[0]!;
    expect(record.sessionId).toBe(SESSION_ID);
    expect(record.turnId).toBe('turn-fixture-001');
    expect(record.currentStage).toBe(fixture.currentStage);
    expect(record.outcome).toBe(fixture.expectedOutcome);
    if (fixture.expectedFailedStep) {
      expect(record.failedStep).toBe(fixture.expectedFailedStep);
    } else {
      expect(record.failedStep).toBeUndefined();
    }
    expect(record.callMetadata).not.toBeNull();
    expect(record.callMetadata).toMatchObject({
      sessionId: SESSION_ID,
      operation: 'interview_turn',
    });

    assertNoCandidateContent(record, fixture.candidateInput);
  });

  it(`${TIMEOUT_FIXTURE.category}: gateway timeout produces fallback + one telemetry record, no candidate content`, async () => {
    vi.useFakeTimers();
    const adapter: GatewayAdapter = {
      provider: 'fake',
      async prepare() {
        return new Promise(() => {});
      },
      async send() {
        return {
          status: 'complete',
          text: '{}',
          reportedModel: null,
          usage: null,
        } as AdapterResult;
      },
    };
    const gateway = createModelGateway({ adapter });
    const recorded: TelemetryRecord[] = [];
    const resultPromise = proposeTurn({
      ...baseRequest({
        currentStage: TIMEOUT_FIXTURE.currentStage,
        candidateInput: TIMEOUT_FIXTURE.candidateInput,
        allowedHintIndex: TIMEOUT_FIXTURE.allowedHintIndex,
        allowedReferenceApproachIds:
          TIMEOUT_FIXTURE.allowedReferenceApproachIds,
      }),
      gateway,
      onCallRecorded: (record) => recorded.push(record),
    });
    await vi.advanceTimersByTimeAsync(15_000);
    const result = await resultPromise;

    expect(result).toMatchObject({
      kind: 'fallback',
      reason: 'gateway_timeout',
    });
    expect(recorded).toHaveLength(1);
    const record = recorded[0]!;
    expect(record.sessionId).toBe(SESSION_ID);
    expect(record.turnId).toBe('turn-fixture-001');
    expect(record.currentStage).toBe(TIMEOUT_FIXTURE.currentStage);
    expect(record.outcome).toBe('gateway_timeout');
    expect(record.failedStep).toBeUndefined();
    expect(record.callMetadata).toMatchObject({ outcome: 'timeout' });

    assertNoCandidateContent(record, TIMEOUT_FIXTURE.candidateInput);
  });
});
