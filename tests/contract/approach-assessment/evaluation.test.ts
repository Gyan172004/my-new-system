import { expect, it } from 'vitest';
import { createFixtureEvaluator } from '../../../src/modules/approach-assessment/application/evaluate';
import { createModelGateway } from '../../../src/modules/model-gateway/public';
import { parseStaffConfiguration } from '../../../src/server/content-staff';
import {
  cases,
  datasetVersion,
  profile,
  reviewerId,
} from '../../fixtures/approach-assessment/dataset-v1';

const auth = { authorization: 'Bearer reviewer', sourceAddress: 'local' };
const proposalByOperation = new Map(
  cases.map((c) => [`evaluation:${c.id}`, c.proposal]),
);

function setup() {
  const gateway = createModelGateway({
    adapter: {
      provider: 'fake',
      async send(request) {
        const proposal = proposalByOperation.get(request.operationId);
        if (!proposal) throw Error('PRIVATE_UNEXPECTED_OPERATION');
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
          return { userId: reviewerId };
        },
        async lookupActiveUser() {
          return { userId: reviewerId };
        },
      },
      staff: parseStaffConfiguration({
        CONTENT_STAFF_GRANTS_JSON: JSON.stringify([
          { userId: reviewerId, permissions: ['review_content'] },
        ]),
        CONTENT_STAFF_CONFIG_REVISION: 'evaluation-dataset-v1',
      }),
      fixtures: cases.map((c) => c.fixture),
    }),
  };
}

// Reproducible aggregate report over reviewed synthetic cases only. This proves
// classifier mechanics against a fixed deterministic fake adapter; it is not,
// and never claims to be, real-provider qualification (K017/T270 remains gated).
it('reports reproducible precision/coverage/abstention and the exact failure slice over the reviewed synthetic dataset', async () => {
  const s = setup();
  try {
    const observed: Array<{
      id: string;
      outcome: string;
      matchedReferenceId: string | null;
    }> = [];
    // Usage/latency per case, for SC-06's "precision, coverage/abstention, false
    // matches, latency and usage" reporting requirement. The fake adapter reports
    // no real usage (completeness stays 'unknown') and vitest timing is not a
    // provider latency signal, so only attempt counts are meaningful locally;
    // real latency/usage is a real-provider-run artifact, not a synthetic one.
    const usage: Array<{ id: string; attempts: number; usageCompleteness: string }> =
      [];
    for (const c of cases) {
      const result = await s.evaluate(
        auth,
        {
          fixtureId: c.id,
          profile,
          labelsQualified: false,
          requestId: `eval-${c.id}`,
        },
        new AbortController().signal,
      );
      expect(result.datasetVersion).toBe(datasetVersion);
      observed.push({
        id: c.id,
        outcome: result.classification.outcome,
        matchedReferenceId: result.classification.matchedReferenceId,
      });
      const metadata = result.metadata as {
        attempts: number;
        durationMs: number;
        usage: { completeness: string };
      };
      usage.push({
        id: c.id,
        attempts: metadata.attempts,
        usageCompleteness: metadata.usage.completeness,
      });
      expect(metadata.durationMs).toBeGreaterThanOrEqual(0);
    }
    expect(usage).toHaveLength(cases.length);
    for (const row of usage) {
      expect(row.attempts).toBe(1);
      expect(row.usageCompleteness).toBe('unknown');
    }

    const total = cases.length;
    const matched = observed.filter((o) => o.outcome === 'matched');
    const ambiguous = observed.filter((o) => o.outcome === 'ambiguous');
    const abstained = observed.filter((o) => o.outcome === 'abstained');
    const novel = observed.filter((o) => o.outcome === 'novel');
    const expectedById = new Map(cases.map((c) => [c.id, c]));
    const correctMatched = matched.filter(
      (o) => o.matchedReferenceId === expectedById.get(o.id)!.expectedReferenceId,
    );
    const failureSlice = observed
      .filter((o) => {
        const expected = expectedById.get(o.id)!;
        return (
          o.outcome !== expected.expectedOutcome ||
          (o.outcome === 'matched' &&
            o.matchedReferenceId !== expected.expectedReferenceId)
        );
      })
      .map((o) => o.id)
      .sort();

    expect(total).toBe(10);
    expect(matched).toHaveLength(4);
    expect(ambiguous).toHaveLength(3);
    expect(abstained).toHaveLength(2);
    expect(novel).toHaveLength(1);

    const precision = correctMatched.length / matched.length;
    const coverage = (matched.length + ambiguous.length + novel.length) / total;
    const abstention = abstained.length / total;
    expect(precision).toBe(0.5);
    expect(coverage).toBe(0.8);
    expect(abstention).toBe(0.2);
    expect(failureSlice).toEqual(['matched-wrong-1', 'matched-wrong-2']);

    // Every observed outcome/reference matches the author-reviewed label exactly
    // except the two deliberate failure-slice cases (proving precision isn't
    // trivially 1.0 and the denominators above are earned, not vacuous).
    for (const o of observed) {
      if (failureSlice.includes(o.id)) continue;
      const expected = expectedById.get(o.id)!;
      expect(o.outcome).toBe(expected.expectedOutcome);
      expect(o.matchedReferenceId).toBe(expected.expectedReferenceId);
    }
  } finally {
    await s.gateway.close();
  }
});
