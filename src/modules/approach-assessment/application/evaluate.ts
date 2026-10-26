import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
  approachAssessmentInputSchema,
  type ModelGateway,
} from '../../model-gateway/public';
import {
  createReviewerAuthorization,
  type PublishingIdentity,
} from '../../content-publishing/public';
import type { AuthenticationInput } from '../../identity-profile/public';
import type { ContentStaffConfiguration } from '../../../server/content-staff';
import { evidenceContextSchema, validateProposal } from '../domain/proposal';
import { classify, classificationProfileSchema } from '../domain/classify';
const token = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]*$/);
const fixtureSchema = z.strictObject({
  id: token,
  source: z.enum(['synthetic', 'reviewer_authored']),
  datasetVersion: token,
  authorId: z.uuid(),
  reviewerId: z.uuid(),
  reviewRef: token,
  contentHash: z.string().regex(/^[a-f0-9]{64}$/),
  input: approachAssessmentInputSchema,
  context: evidenceContextSchema,
});
const requestSchema = z.strictObject({
  fixtureId: token,
  profile: classificationProfileSchema,
  labelsQualified: z.literal(false),
  requestId: token,
});
function hash(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
function freeze<T>(v: T): T {
  if (v && typeof v === 'object') {
    for (const nested of Object.values(v)) freeze(nested);
    Object.freeze(v);
  }
  return v;
}
// Registry is trusted reviewed server configuration, never caller-supplied fixture content.
// This service receives no database, session writer, qualification setter or event sink.
export function createFixtureEvaluator(
  dependencies: Readonly<{
    gateway: ModelGateway;
    identity: PublishingIdentity;
    staff: ContentStaffConfiguration;
    fixtures: readonly unknown[];
  }>,
) {
  const authorize = createReviewerAuthorization(
    dependencies.identity,
    dependencies.staff,
  );
  if (dependencies.fixtures.length > 1000)
    throw Error('invalid_evaluation_fixture');
  const registry = new Map<string, z.infer<typeof fixtureSchema>>();
  for (const raw of dependencies.fixtures) {
    const p = fixtureSchema.safeParse(raw);
    if (!p.success) throw Error('invalid_evaluation_fixture');
    const f = p.data;
    if (
      registry.has(f.id) ||
      new Set(f.input.references.map((r) => r.id)).size !==
        f.input.references.length ||
      new Set(f.context.referenceIds).size !== f.context.referenceIds.length ||
      f.authorId === f.reviewerId ||
      f.context.sessionId !== `fixture:${f.id}` ||
      f.context.evidence.some((e) => e.sessionId !== f.context.sessionId) ||
      JSON.stringify(f.input.evidence) !== JSON.stringify(f.context.evidence) ||
      f.input.references.some((r) => !f.context.referenceIds.includes(r.id)) ||
      f.input.references.length !== f.context.referenceIds.length ||
      f.contentHash !== hash({ input: f.input, context: f.context })
    )
      throw Error('invalid_evaluation_fixture');
    if (Buffer.byteLength(JSON.stringify(f.input)) > 16384)
      throw Error('invalid_evaluation_fixture');
    registry.set(f.id, freeze(f));
  }
  return async (
    auth: AuthenticationInput,
    raw: unknown,
    signal: AbortSignal,
  ) => {
    await authorize(auth);
    const checked = requestSchema.safeParse(raw);
    if (!checked.success) throw Error('invalid_evaluation_request');
    const request = checked.data;
    const fixture = registry.get(request.fixtureId);
    if (!fixture) throw Error('invalid_evaluation_fixture');
    const result = await dependencies.gateway.invoke({
      operation: 'approach_assessment',
      input: fixture.input,
      context: {
        requestId: request.requestId,
        operationId: `evaluation:${fixture.id}`,
      },
      signal,
    });
    if (!result.ok) throw Error('assessment_evaluation_unavailable');
    const classification = classify(
      validateProposal(result.data, fixture.context),
      request.profile,
    );
    return freeze({
      fixtureId: fixture.id,
      fixtureHash: fixture.contentHash,
      datasetVersion: fixture.datasetVersion,
      profileHash: hash(request.profile),
      classification,
      metadata: result.metadata,
    });
  };
}
