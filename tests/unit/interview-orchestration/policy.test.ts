import { describe, expect, it } from 'vitest';
import {
  applyPolicy,
  type ApplyPolicyContext,
  type ApplyPolicyRequest,
  type ValidatedInterviewTurnOutput,
} from '../../../src/modules/interview-orchestration/application/policy';

function baseValidated(
  overrides: Partial<ValidatedInterviewTurnOutput> = {},
): ValidatedInterviewTurnOutput {
  return {
    schemaVersion: 1,
    responseText: 'Let us walk through the problem statement together.',
    ...overrides,
  };
}

function baseContext(
  overrides: Partial<ApplyPolicyContext> = {},
): ApplyPolicyContext {
  return { stage: 'initial_approach', ...overrides };
}

function baseRequest(
  overrides: Partial<ApplyPolicyRequest> = {},
): ApplyPolicyRequest {
  return {
    allowedReferenceApproachIds: ['approach-hash-map'],
    allowedHintIndex: 0,
    pack: { privateFields: ['EXPECTED_HIDDEN_OUTPUT_42'] },
    ...overrides,
  };
}

describe('applyPolicy', () => {
  it('accepts a fully valid proposal, running all five steps in order with no false rejection', () => {
    const decision = applyPolicy(
      baseValidated({
        matchedReferenceApproachId: 'approach-hash-map',
        suggestedTransitionSignal: 'ready_to_advance',
      }),
      baseContext({ stage: 'initial_approach' }),
      baseRequest({ allowedReferenceApproachIds: ['approach-hash-map'] }),
    );

    expect(decision).toEqual({
      kind: 'accepted',
      proposal: {
        responseText: 'Let us walk through the problem statement together.',
        suggestedTransitionSignal: 'ready_to_advance',
        matchedReferenceApproachId: 'approach-hash-map',
      },
    });
  });

  it('defaults suggestedTransitionSignal to "none" when the validated output omits it', () => {
    const decision = applyPolicy(
      baseValidated(),
      baseContext({ stage: 'intro' }),
      baseRequest(),
    );

    expect(decision.kind).toBe('accepted');
    if (decision.kind === 'accepted') {
      expect(decision.proposal.suggestedTransitionSignal).toBe('none');
    }
  });

  describe('step 1: stage applicability', () => {
    it('rejects a matchedReferenceApproachId outside the approach-discussion stages', () => {
      const decision = applyPolicy(
        baseValidated({ matchedReferenceApproachId: 'approach-hash-map' }),
        baseContext({ stage: 'intro' }),
        baseRequest({ allowedReferenceApproachIds: ['approach-hash-map'] }),
      );

      expect(decision).toEqual({
        kind: 'rejected',
        failedStep: 'stage_applicability',
      });
    });

    it('accepts a matchedReferenceApproachId inside each approach-discussion stage', () => {
      for (const stage of [
        'initial_approach',
        'approach_clarification',
        'improve_approach',
      ] as const) {
        const decision = applyPolicy(
          baseValidated({ matchedReferenceApproachId: 'approach-hash-map' }),
          baseContext({ stage }),
          baseRequest({ allowedReferenceApproachIds: ['approach-hash-map'] }),
        );
        expect(decision.kind).toBe('accepted');
      }
    });
  });

  describe('step 2: reference-ID containment', () => {
    it('rejects a matchedReferenceApproachId not present in allowedReferenceApproachIds', () => {
      const decision = applyPolicy(
        baseValidated({ matchedReferenceApproachId: 'approach-not-allowed' }),
        baseContext({ stage: 'initial_approach' }),
        baseRequest({ allowedReferenceApproachIds: ['approach-hash-map'] }),
      );

      expect(decision).toEqual({
        kind: 'rejected',
        failedStep: 'reference_id_containment',
      });
    });

    it('accepts abstention: an absent matchedReferenceApproachId is a normal outcome, never forced or rejected', () => {
      const decision = applyPolicy(
        baseValidated(),
        baseContext({ stage: 'initial_approach' }),
        baseRequest({ allowedReferenceApproachIds: ['approach-hash-map'] }),
      );

      expect(decision.kind).toBe('accepted');
      if (decision.kind === 'accepted') {
        expect(decision.proposal.matchedReferenceApproachId).toBeUndefined();
      }
    });

    it('accepts abstention even when allowedReferenceApproachIds is empty', () => {
      const decision = applyPolicy(
        baseValidated(),
        baseContext({ stage: 'initial_approach' }),
        baseRequest({ allowedReferenceApproachIds: [] }),
      );

      expect(decision.kind).toBe('accepted');
    });

    it.each(['approach_clarification', 'improve_approach'] as const)(
      'accepts abstention in %s too, not only initial_approach',
      (stage) => {
        const decision = applyPolicy(
          baseValidated(),
          baseContext({ stage }),
          baseRequest({ allowedReferenceApproachIds: ['approach-hash-map'] }),
        );

        expect(decision.kind).toBe('accepted');
        if (decision.kind === 'accepted') {
          expect(decision.proposal.matchedReferenceApproachId).toBeUndefined();
        }
      },
    );
  });

  describe('step 3: hint-ladder containment (threading checkpoint)', () => {
    // The registered interviewTurnOutputSchema has no hint-index or
    // hint-content field today, so there is nothing genuine to pattern-match
    // against yet (full containment is Stage 6/K-019's scope, per
    // tech_design.md's own boundary). This test proves the honest minimum:
    // request.allowedHintIndex is actually read at this checkpoint rather
    // than being dead wiring, by exercising the boundary where the
    // (currently always-0) implied hint index would exceed an
    // out-of-range allowedHintIndex.
    it('threads allowedHintIndex into the checkpoint: rejects when it is below the implied (currently 0) hint index', () => {
      const decision = applyPolicy(
        baseValidated(),
        baseContext({ stage: 'hints' }),
        baseRequest({ allowedHintIndex: -1 }),
      );

      expect(decision).toEqual({
        kind: 'rejected',
        failedStep: 'hint_ladder_containment',
      });
    });

    it('passes through when allowedHintIndex is non-negative (the only value the current schema can imply)', () => {
      const decision = applyPolicy(
        baseValidated(),
        baseContext({ stage: 'hints' }),
        baseRequest({ allowedHintIndex: 0 }),
      );

      expect(decision.kind).toBe('accepted');
    });
  });

  describe('step 4: content-exposure scan', () => {
    it('rejects when responseText exactly equals a private field value', () => {
      const decision = applyPolicy(
        baseValidated({ responseText: 'EXPECTED_HIDDEN_OUTPUT_42' }),
        baseContext({ stage: 'intro' }),
        baseRequest({ pack: { privateFields: ['EXPECTED_HIDDEN_OUTPUT_42'] } }),
      );

      expect(decision).toEqual({
        kind: 'rejected',
        failedStep: 'content_exposure',
      });
    });

    it('rejects when a private field value appears only as a substring within a longer responseText', () => {
      const decision = applyPolicy(
        baseValidated({
          responseText:
            'Great approach! By the way, the hidden expected output is EXPECTED_HIDDEN_OUTPUT_42 for this test case.',
        }),
        baseContext({ stage: 'test_and_debug' }),
        baseRequest({ pack: { privateFields: ['EXPECTED_HIDDEN_OUTPUT_42'] } }),
      );

      expect(decision).toEqual({
        kind: 'rejected',
        failedStep: 'content_exposure',
      });
    });

    it('accepts when responseText does not contain any private field value', () => {
      const decision = applyPolicy(
        baseValidated({ responseText: 'Nothing private here at all.' }),
        baseContext({ stage: 'intro' }),
        baseRequest({ pack: { privateFields: ['EXPECTED_HIDDEN_OUTPUT_42'] } }),
      );

      expect(decision.kind).toBe('accepted');
    });

    it('never rejects on an empty privateFields set', () => {
      const decision = applyPolicy(
        baseValidated({ responseText: 'anything at all' }),
        baseContext({ stage: 'intro' }),
        baseRequest({ pack: { privateFields: [] } }),
      );

      expect(decision.kind).toBe('accepted');
    });
  });

  describe('step 5: transition authority', () => {
    it('never rejects based on suggestedTransitionSignal and passes it through unchanged as advisory data', () => {
      for (const signal of [
        'ready_to_advance',
        'needs_clarification',
        'none',
      ] as const) {
        const decision = applyPolicy(
          baseValidated({ suggestedTransitionSignal: signal }),
          baseContext({ stage: 'intro' }),
          baseRequest(),
        );

        expect(decision.kind).toBe('accepted');
        if (decision.kind === 'accepted') {
          expect(decision.proposal.suggestedTransitionSignal).toBe(signal);
        }
      }
    });
  });
});
