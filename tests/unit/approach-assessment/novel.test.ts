import { expect, it } from 'vitest';
import { validateProposal } from '../../../src/modules/approach-assessment/domain/proposal';
import {
  classify,
  projectAssessment,
} from '../../../src/modules/approach-assessment/domain/classify';
import {
  proposal,
  context,
  profile,
} from '../../fixtures/approach-assessment/semantic';
it('records understood unmatched reasoning without claiming correctness', () => {
  const result = classify(
    validateProposal({ ...proposal, matches: [] }, context),
    profile,
  );
  expect(result).toMatchObject({
    outcome: 'novel',
    matchedReferenceId: null,
    reasonCode: 'unmatched_understood',
  });
  expect(projectAssessment(result).text).not.toMatch(/correct|verified/i);
});
it('abstains on uninterpretable or unsupported explanation', () => {
  for (const patch of [
    { interpretation: 'uninterpretable' },
    { matches: [], findings: [] },
  ])
    expect(
      classify(validateProposal({ ...proposal, ...patch }, context), profile),
    ).toMatchObject({
      outcome: 'abstained',
      matchedReferenceId: null,
      reasonCode: 'insufficient_evidence',
    });
});
