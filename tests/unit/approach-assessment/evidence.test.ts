import { expect, it } from 'vitest';
import { validateProposal } from '../../../src/modules/approach-assessment/domain/proposal';
import {
  proposal,
  context,
  citation,
} from '../../fixtures/approach-assessment/semantic';
it('resolves Unicode code-point spans exactly', () =>
  expect(
    validateProposal(proposal, context).matches[0]?.evidenceRefs[0],
  ).toEqual(citation));
it('rejects forged evidence, future/wrong-session/interviewer/stage/modality sources and absent finding evidence', () => {
  for (const patch of [
    { speaker: 'interviewer' },
    { sessionId: 'other' },
    { version: 3 },
    { stage: 'code' },
    { modality: 'audio' },
  ])
    expect(() =>
      validateProposal(proposal, {
        ...context,
        evidence: [{ ...context.evidence[0], ...patch }],
      }),
    ).toThrow('invalid_assessment_proposal');
  for (const ref of [
    { ...citation, turnId: 'forged' },
    { ...citation, span: { start: 3, end: 13, excerpt: 'I use a map' } },
    { ...citation, span: { start: 2, end: 99, excerpt: 'I use a map' } },
  ])
    expect(() =>
      validateProposal(
        {
          ...proposal,
          matches: [{ ...proposal.matches[0], evidenceRefs: [ref] }],
        },
        context,
      ),
    ).toThrow('invalid_assessment_proposal');
  expect(() =>
    validateProposal(
      {
        ...proposal,
        findings: [{ ...proposal.findings[0], evidenceRefs: [] }],
      },
      context,
    ),
  ).toThrow('invalid_assessment_proposal');
});
it('accepts only the operation reserved pending candidate turn above source version', () =>
  expect(
    validateProposal(proposal, {
      ...context,
      reservedCandidateTurnId: 'turn-1',
      evidence: [{ ...context.evidence[0], version: 3 }],
    }).matches,
  ).toHaveLength(1));
it('rejects an oversized combined context without silent truncation and freezes verified evidence', () => {
  const oversized = {
    ...context,
    evidence: [
      ...context.evidence,
      ...Array.from({ length: 3 }, (_, i) => ({
        ...context.evidence[0],
        id: `extra-${i}`,
        text: 'x'.repeat(8192),
      })),
    ],
  };
  expect(() => validateProposal(proposal, oversized)).toThrow(
    'invalid_assessment_proposal',
  );
  const validated = validateProposal(proposal, context);
  expect(Object.isFrozen(validated.matches[0]?.evidenceRefs[0]?.span)).toBe(
    true,
  );
});
