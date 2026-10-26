import { z } from 'zod';
import {
  approachAssessmentOutputSchema,
  assessmentEvidenceSchema,
} from '../../model-gateway/public';
const id = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]*$/);
export const evidenceContextSchema = z.strictObject({
  sessionId: id,
  sourceVersion: z.number().int().nonnegative(),
  reservedCandidateTurnId: id.nullable(),
  referenceIds: z.array(id).min(1).max(64),
  evidence: z.array(assessmentEvidenceSchema).min(1).max(32),
});
export type EvidenceContext = z.infer<typeof evidenceContextSchema>;
export type AssessmentProposal = z.infer<typeof approachAssessmentOutputSchema>;
declare const verified: unique symbol;
export type VerifiedProposal = AssessmentProposal & {
  readonly [verified]: true;
};
export function validateProposal(
  raw: unknown,
  rawContext: unknown,
): VerifiedProposal {
  const fail = (): never => {
    throw Error('invalid_assessment_proposal');
  };
  const result = approachAssessmentOutputSchema.safeParse(raw),
    ctx = evidenceContextSchema.safeParse(rawContext);
  if (!result.success || !ctx.success) return fail();
  const p = result.data,
    c = ctx.data;
  if (
    Buffer.byteLength(JSON.stringify(c)) > 16384 ||
    Buffer.byteLength(JSON.stringify(p)) > 131072
  )
    fail();
  const sources = new Map(
    c.evidence.map((e) => [e.id, { ...e, points: Array.from(e.text) }]),
  );
  if (
    sources.size !== c.evidence.length ||
    new Set(c.referenceIds).size !== c.referenceIds.length
  )
    fail();
  const allowed = new Set(c.referenceIds),
    seen = new Set<string>();
  const check = (
    ref: AssessmentProposal['matches'][number]['evidenceRefs'][number],
  ) => {
    const source = sources.get(ref.turnId);
    if (
      !source ||
      source.sessionId !== c.sessionId ||
      (source.version > c.sourceVersion &&
        source.id !== c.reservedCandidateTurnId)
    )
      return fail();
    if (ref.span) {
      const { start, end, excerpt } = ref.span;
      if (
        start >= end ||
        end > source.points.length ||
        source.points.slice(start, end).join('') !== excerpt
      )
        fail();
    }
  };
  for (const m of p.matches) {
    if (!allowed.has(m.referenceId) || seen.has(m.referenceId)) fail();
    seen.add(m.referenceId);
    for (const ref of m.evidenceRefs) check(ref);
  }
  for (const claim of [
    ...p.findings,
    ...[p.candidateComplexity.time, p.candidateComplexity.space].filter(
      (v) => v !== null,
    ),
  ])
    for (const ref of claim.evidenceRefs) check(ref);
  const freeze = (v: unknown): void => {
    if (v && typeof v === 'object') {
      for (const nested of Object.values(v)) freeze(nested);
      Object.freeze(v);
    }
  };
  freeze(p);
  return p as VerifiedProposal;
}
