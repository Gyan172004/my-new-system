// IO-06 (T211/T212), fixture-only per eng_design.md §1 and tasks.md Group
// 06's explicit scoping note.
//
// THIS IS NOT A LIVE K-014/K-016 INTEGRATION TEST. As of 2026-10-24,
// project_management/kanban_board.md lists K-014 ("Implement first session
// API endpoints") and K-016 ("Verify first end-to-end session flow and
// resume") both under `## Backlog` — neither In Progress nor Done — and
// `src/modules/interview-session/public.ts` exports only
// `createSessionService`, with no guarded-commit mutation path implemented
// yet. This file does not import, construct, or touch anything under
// `src/modules/interview-session/`. Instead it constructs a minimal,
// test-local stand-in "session command handler" right here, matching the
// INTENDED design boundary (tech_design.md §2 / logic_and_state.md §3-4 /
// session_state_machine.md §4): proposeTurn's `TurnProposal` is advisory
// input only; only the state machine's own transition table may ever write
// `currentStage`. Genuine end-to-end integration against K-014/K-016's real
// commit path remains separate, later work, blocked on those cards' own
// observed Kanban acceptance.

import { describe, expect, it } from 'vitest';
import {
  createModelGateway,
  type AdapterResult,
  type GatewayAdapter,
} from '../../../src/modules/model-gateway/public';
import {
  proposeTurn,
  PROMPT_BEARING_STAGES,
  type InterviewStage,
  type ProposeTurnResult,
  type TurnProposal,
} from '../../../src/modules/interview-orchestration/public';

// Real ProposeTurnResult values are produced by actually calling
// proposeTurn against a fake adapter (the established pattern from
// tests/contract/interview-orchestration/propose-turn.test.ts), rather than
// hand-typing GatewayMetadata literals — this keeps the fixture honest
// against the real `callMetadata` shape without retyping it here.
async function proposalResultWith(
  suggestedTransitionSignal: TurnProposal['suggestedTransitionSignal'],
): Promise<ProposeTurnResult> {
  const adapter: GatewayAdapter = {
    provider: 'fake',
    async send(): Promise<AdapterResult> {
      return {
        status: 'complete',
        text: JSON.stringify({
          schemaVersion: 1,
          responseText: 'Tell me more.',
          suggestedTransitionSignal,
        }),
        reportedModel: null,
        usage: null,
      };
    },
  };
  return proposeTurn({
    requestId: 'req-guarded-commit',
    sessionId: '33333333-3333-4333-8333-333333333333',
    turnId: 'turn-guarded-commit',
    expectedSessionVersion: 1,
    currentStage: 'initial_approach',
    packVersion: 'pack-v1',
    policyVersion: 'policy-v1',
    allowedHintIndex: 0,
    allowedReferenceApproachIds: ['approach-hash-map'],
    recentTurns: [],
    candidateInput: 'Here is my approach.',
    pack: { fields: {}, privateFields: [] },
    signal: new AbortController().signal,
    gateway: createModelGateway({ adapter }),
  });
}

async function policyRejectedFallbackResult(): Promise<ProposeTurnResult> {
  const adapter: GatewayAdapter = {
    provider: 'fake',
    async send(): Promise<AdapterResult> {
      // Reference ID outside the allowlist -> policy_rejected fallback.
      return {
        status: 'complete',
        text: JSON.stringify({
          schemaVersion: 1,
          responseText: 'Tell me more.',
          suggestedTransitionSignal: 'none',
          matchedReferenceApproachId: 'not-in-pack',
        }),
        reportedModel: null,
        usage: null,
      };
    },
  };
  return proposeTurn({
    requestId: 'req-guarded-commit-fallback',
    sessionId: '33333333-3333-4333-8333-333333333333',
    turnId: 'turn-guarded-commit-fallback',
    expectedSessionVersion: 7,
    currentStage: 'initial_approach',
    packVersion: 'pack-v1',
    policyVersion: 'policy-v1',
    allowedHintIndex: 0,
    allowedReferenceApproachIds: ['approach-hash-map'],
    recentTurns: [],
    candidateInput: 'Here is my approach.',
    pack: { fields: {}, privateFields: [] },
    signal: new AbortController().signal,
    gateway: createModelGateway({ adapter }),
  });
}

// The real `InterviewStage` domain (session_state_machine.md §2), reused
// directly from the orchestration module's own exported constant — not
// reinvented here.
const ALL_STAGE_VALUES: ReadonlySet<string> = new Set<string>([
  ...PROMPT_BEARING_STAGES,
  'created',
  'completed',
]);

// `TurnProposal.suggestedTransitionSignal`'s full value domain
// (policy.ts). This is the structural fact the test exploits: these three
// strings are NOT members of InterviewStage at all.
const SUGGESTED_TRANSITION_SIGNALS = [
  'ready_to_advance',
  'needs_clarification',
  'none',
] as const;

/**
 * A minimal, test-local stand-in for session_state_machine.md §4's
 * transition table — just enough of its shape (keyed by `from` stage, each
 * entry exposing a `resolve` guard) to prove the boundary. Not production
 * code; not the real table (which also covers pause/resume/error/
 * terminal-state rows not relevant to this proof).
 */
const TRANSITION_TABLE: Readonly<
  Record<
    InterviewStage,
    {
      readonly resolve: (
        signal: TurnProposal['suggestedTransitionSignal'],
      ) => InterviewStage;
    }
  >
> = {
  created: { resolve: () => 'created' },
  intro: { resolve: () => 'experience_context' },
  experience_context: { resolve: () => 'problem_read_and_clarify' },
  problem_read_and_clarify: { resolve: () => 'problem_restatement' },
  problem_restatement: { resolve: () => 'sample_trace' },
  sample_trace: { resolve: () => 'initial_approach' },
  // Mirrors session_state_machine.md §4's real guarded row: the table's own
  // guard decides between the two legal destinations; it merely reads the
  // model's advisory signal as one input, never adopts it as the stage name.
  initial_approach: {
    resolve: (signal) =>
      signal === 'needs_clarification' ? 'approach_clarification' : 'hints',
  },
  approach_clarification: { resolve: () => 'initial_approach' },
  hints: { resolve: () => 'hints' },
  code: { resolve: () => 'test_and_debug' },
  test_and_debug: { resolve: () => 'code' },
  improve_approach: { resolve: () => 'code' },
  variants_and_followups: { resolve: () => 'complexity_analysis' },
  complexity_analysis: { resolve: () => 'feedback' },
  feedback: { resolve: () => 'completed' },
  completed: { resolve: () => 'completed' },
};

interface SessionSnapshot {
  readonly currentStage: InterviewStage;
  readonly version: number;
}

/**
 * The test-local stand-in for the session module's intended guarded-commit
 * boundary: `proposal.suggestedTransitionSignal` (when present) is read ONLY
 * as one input to `TRANSITION_TABLE[session.currentStage].resolve(...)`;
 * it is never assigned directly to `currentStage`. A `fallback` result never
 * advances the session at all — version/stage are untouched.
 */
function applyGuardedCommit(
  session: SessionSnapshot,
  proposalResult: ProposeTurnResult,
): SessionSnapshot {
  if (proposalResult.kind === 'fallback') {
    return session;
  }
  const nextStage = TRANSITION_TABLE[session.currentStage].resolve(
    proposalResult.proposal.suggestedTransitionSignal,
  );
  return { currentStage: nextStage, version: session.version + 1 };
}

describe('IO-06 guarded-commit boundary (fixture-only design proof, not live K-014/K-016 integration)', () => {
  it("suggestedTransitionSignal's value domain is disjoint from InterviewStage — a direct assignment could never even type/domain-check", () => {
    // This is the structural fact that makes "fix the handler to assign
    // currentStage = proposal.suggestedTransitionSignal directly" a failing
    // change, not merely a style preference: none of the three signal
    // values is ever a valid stage name.
    for (const signal of SUGGESTED_TRANSITION_SIGNALS) {
      expect(ALL_STAGE_VALUES.has(signal)).toBe(false);
    }
  });

  it('a proposal result only ever reaches currentStage through TRANSITION_TABLE[...].resolve(...), never as a direct assignment of the signal', async () => {
    const session: SessionSnapshot = {
      currentStage: 'initial_approach',
      version: 3,
    };
    const proposalResult = await proposalResultWith('needs_clarification');
    if (proposalResult.kind !== 'proposal') {
      throw new Error('expected a proposal result');
    }

    const next = applyGuardedCommit(session, proposalResult);

    // The committed value is a real, valid stage (resolved by the table)...
    expect(ALL_STAGE_VALUES.has(next.currentStage)).toBe(true);
    // ...and it is specifically NOT the raw signal string: had the
    // test-local handler been "simplified" to
    // `currentStage = proposal.suggestedTransitionSignal` directly, this
    // assertion fails immediately, because 'needs_clarification' is not a
    // valid InterviewStage at all (proven above) and is not equal to the
    // table's actual resolved destination.
    expect(next.currentStage).not.toBe(
      proposalResult.proposal.suggestedTransitionSignal,
    );
    expect(next.currentStage).toBe('approach_clarification');
    expect(next.version).toBe(4);
  });

  it('a different suggestedTransitionSignal at the same stage resolves to a different destination via the table, still never the raw signal', async () => {
    const session: SessionSnapshot = {
      currentStage: 'initial_approach',
      version: 1,
    };
    const proposalResult = await proposalResultWith('ready_to_advance');
    if (proposalResult.kind !== 'proposal') {
      throw new Error('expected a proposal result');
    }

    const next = applyGuardedCommit(session, proposalResult);

    expect(next.currentStage).toBe('hints');
    expect(next.currentStage).not.toBe('ready_to_advance');
  });

  it('a fallback result never changes currentStage or version', async () => {
    const session: SessionSnapshot = {
      currentStage: 'initial_approach',
      version: 7,
    };
    const fallbackResult = await policyRejectedFallbackResult();
    expect(fallbackResult.kind).toBe('fallback');

    const next = applyGuardedCommit(session, fallbackResult);

    expect(next).toEqual(session);
    expect(next.currentStage).toBe('initial_approach');
    expect(next.version).toBe(7);
  });
});
