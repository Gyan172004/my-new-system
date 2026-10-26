import { expect, it } from 'vitest';
import { validateProposal } from '../../../src/modules/approach-assessment/domain/proposal';
import { classify } from '../../../src/modules/approach-assessment/domain/classify';
import {
  proposal,
  context,
  profile,
} from '../../fixtures/approach-assessment/semantic';
it.each(['incomplete', 'conflicting'] as const)(
  'preserves %s uncertainty without a reference label',
  (interpretation) =>
    expect(
      classify(
        validateProposal({ ...proposal, interpretation }, context),
        profile,
      ),
    ).toMatchObject({
      outcome: 'ambiguous',
      reasonCode: 'clarification_needed',
      matchedReferenceId: null,
    }),
);
it('does not label reasoning with unresolved contradiction', () =>
  expect(
    classify(
      validateProposal(
        {
          ...proposal,
          findings: [{ ...proposal.findings[0], kind: 'contradiction' }],
        },
        context,
      ),
      profile,
    ),
  ).toMatchObject({
    outcome: 'ambiguous',
    reasonCode: 'unresolved_reasoning',
    matchedReferenceId: null,
  }));
