import { expect, it } from 'vitest';
import { validateProposal } from '../../../src/modules/approach-assessment/domain/proposal';
import { proposal, context } from '../../fixtures/approach-assessment/semantic';
it('rejects forged schemas, reference membership, duplicate IDs and nonfinite confidence', () => {
  for (const value of [
    { ...proposal, secret: 'CANARY' },
    { ...proposal, schemaVersion: 2 },
    { ...proposal, matches: [...proposal.matches, ...proposal.matches] },
    ...[NaN, Infinity, -0.1, 1.1].map((confidence) => ({
      ...proposal,
      matches: [{ ...proposal.matches[0], confidence }],
    })),
    {
      ...proposal,
      matches: [{ ...proposal.matches[0], referenceId: 'unknown' }],
    },
  ])
    expect(() => validateProposal(value, context)).toThrow(
      'invalid_assessment_proposal',
    );
});
it('retains null candidate complexity rather than reference complexity', () =>
  expect(validateProposal(proposal, context).candidateComplexity).toEqual({
    time: null,
    space: null,
  }));
