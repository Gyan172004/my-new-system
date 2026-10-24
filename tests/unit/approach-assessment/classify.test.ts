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
it.each([
  [0.75, 0.625, 'matched'],
  [0.749, 0.5, 'abstained'],
  [0.75, 0.626, 'ambiguous'],
  [0.8, 0.8, 'ambiguous'],
] as const)(
  'enforces exact threshold/margin/tie boundaries %s/%s',
  (a, b, outcome) => {
    const result = classify(
      validateProposal(
        {
          ...proposal,
          matches: [
            { ...proposal.matches[0], confidence: a },
            { ...proposal.matches[0], referenceId: 'sort', confidence: b },
          ],
        },
        context,
      ),
      profile,
    );
    expect(result.outcome).toBe(outcome);
    expect(result.matchedReferenceId).toBe(
      outcome === 'matched' ? 'map' : null,
    );
    expect(JSON.stringify(projectAssessment(result))).not.toMatch(
      /PRIVATE|map|sort|confidence|evidenceRefs/,
    );
  },
);
it('rejects unreviewed numeric defaults and nonfinite profile configuration', () => {
  for (const tau of [undefined, NaN, Infinity, -1])
    expect(() =>
      classify(validateProposal(proposal, context), { ...profile, tau }),
    ).toThrow('invalid_assessment_profile');
});
