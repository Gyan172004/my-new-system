import { createHash } from 'node:crypto';
import { expect, it } from 'vitest';
import { createFixtureEvaluator } from '../../../src/modules/approach-assessment/application/evaluate';
import { createModelGateway } from '../../../src/modules/model-gateway/public';
import { parseStaffConfiguration } from '../../../src/server/content-staff';
import {
  proposal,
  evidence,
  profile,
  context,
} from '../../fixtures/approach-assessment/semantic';
const reviewer = '00000000-0000-4000-8000-000000000001';
const author = '00000000-0000-4000-8000-000000000002';
const fixtureContext = {
  ...context,
  referenceIds: ['map'],
  sessionId: 'fixture:example',
  evidence: evidence.map((e) => ({ ...e, sessionId: 'fixture:example' })),
};
const input = {
  text: evidence[0].text,
  references: [
    {
      id: 'map',
      name: 'Map',
      summary: 'PRIVATE_REFERENCE',
      preconditions: [],
      matchingFeatures: [],
    },
  ],
  evidence: fixtureContext.evidence,
};
const fixture = {
  id: 'example',
  source: 'synthetic',
  datasetVersion: 'reviewed-v1',
  authorId: author,
  reviewerId: reviewer,
  reviewRef: 'review:example',
  context: fixtureContext,
  input,
  contentHash: createHash('sha256')
    .update(JSON.stringify({ input, context: fixtureContext }))
    .digest('hex'),
};
const auth = { authorization: 'Bearer reviewer', sourceAddress: 'local' };
function setup(
  userId = reviewer,
  active = true,
  fixtures: readonly unknown[] = [fixture],
) {
  const gateway = createModelGateway({
    adapter: {
      provider: 'fake',
      async send() {
        return {
          status: 'complete',
          text: JSON.stringify(proposal),
          reportedModel: null,
          usage: null,
        };
      },
    },
    environment: 'test',
  });
  return {
    gateway,
    evaluate: createFixtureEvaluator({
      gateway,
      identity: {
        async authenticate() {
          return { userId };
        },
        async lookupActiveUser() {
          return active ? { userId } : null;
        },
      },
      staff: parseStaffConfiguration({
        CONTENT_STAFF_GRANTS_JSON: JSON.stringify([
          { userId: reviewer, permissions: ['review_content'] },
        ]),
        CONTENT_STAFF_CONFIG_REVISION: 'review-v1',
      }),
      fixtures,
    }),
  };
}
it('evaluates reviewed synthetic input through real Gateway while labels disabled without mutation capabilities', async () => {
  const s = setup();
  const result = await s.evaluate(
    auth,
    {
      fixtureId: 'example',
      profile,
      labelsQualified: false,
      requestId: 'eval-1',
    },
    new AbortController().signal,
  );
  expect(result).toMatchObject({
    fixtureId: 'example',
    datasetVersion: 'reviewed-v1',
    classification: { outcome: 'matched', matchedReferenceId: 'map' },
    metadata: { operation: 'approach_assessment', attempts: 1 },
  });
  expect(result.fixtureHash).toBe(fixture.contentHash);
  await s.gateway.close();
});
it('rejects candidates, inactive reviewers and caller authorization booleans', async () => {
  for (const [user, active] of [
    [author, true],
    [reviewer, false],
  ] as const) {
    const s = setup(user, active);
    await expect(
      s.evaluate(
        auth,
        {
          fixtureId: 'example',
          profile,
          labelsQualified: false,
          requestId: 'eval-1',
        },
        new AbortController().signal,
      ),
    ).rejects.toThrow('content_forbidden');
    await s.gateway.close();
  }
  const s = setup();
  await expect(
    s.evaluate(
      auth,
      {
        fixtureId: 'example',
        profile,
        labelsQualified: false,
        requestId: 'eval-1',
        authorized: true,
      },
      new AbortController().signal,
    ),
  ).rejects.toThrow('invalid_evaluation_request');
  await s.gateway.close();
});
it('rejects runtime production transcripts and unreviewed/tampered registry content', async () => {
  const s = setup();
  await expect(
    s.evaluate(
      auth,
      {
        fixtureId: 'example',
        profile,
        labelsQualified: false,
        requestId: 'eval-1',
        sessionId: 'production',
        text: 'PRIVATE_TRANSCRIPT',
      },
      new AbortController().signal,
    ),
  ).rejects.toThrow('invalid_evaluation_request');
  await s.gateway.close();
  for (const bad of [
    { ...fixture, source: 'production' },
    { ...fixture, reviewRef: '' },
    { ...fixture, input: { ...input, text: 'tampered' } },
    { ...fixture, context: { ...fixtureContext, sessionId: 'production' } },
  ])
    expect(() => setup(reviewer, true, [bad])).toThrow(
      'invalid_evaluation_fixture',
    );
});
it('rejects duplicate or mismatched reference projections before provider dispatch', () => {
  for (const [referenceIds, references] of [
    [
      ['map', 'sort'],
      [input.references[0], input.references[0]],
    ],
    [
      ['map', 'map'],
      [input.references[0], input.references[0]],
    ],
    [['map', 'sort'], [input.references[0]]],
  ] as const) {
    const badInput = { ...input, references };
    const badContext = { ...fixtureContext, referenceIds };
    const bad = {
      ...fixture,
      input: badInput,
      context: badContext,
      contentHash: createHash('sha256')
        .update(JSON.stringify({ input: badInput, context: badContext }))
        .digest('hex'),
    };
    expect(() => setup(reviewer, true, [bad])).toThrow(
      'invalid_evaluation_fixture',
    );
  }
});
