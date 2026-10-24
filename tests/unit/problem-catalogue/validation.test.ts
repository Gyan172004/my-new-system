import { describe, expect, it } from 'vitest';
import { validatePack } from '../../../src/modules/content-publishing/domain/validate-pack';
import { createApprovedPack } from '../../fixtures/problem-catalogue';

describe('pack semantic admission', () => {
  it('returns complete immutable data and readiness without granting authority', () => {
    const result = validatePack(JSON.stringify(createApprovedPack()));
    expect(result).toMatchObject({ ok: true, publishable: true });
    if (!result.ok) return;
    expect(result.checksum).toMatch(/^[0-9a-f]{64}$/);
    expect(Object.isFrozen(result.pack.evaluation.cases[0]!.input.nums)).toBe(
      true,
    );
  });
  it.each([
    'clarifications',
    'approaches',
    'mistakes',
    'hintLadders',
    'followups',
    'variants',
    'sources',
    'dimensions',
    'hints',
    'cases',
  ])('rejects duplicate IDs in %s namespace', (namespace) => {
    const p = createApprovedPack();
    const arrays: Record<string, unknown[]> = {
      ...p.interview,
      sources: p.provenance.sources,
      dimensions: p.interview.rubric.dimensions,
      hints: p.interview.hintLadders[0]!.hints,
      cases: p.evaluation.cases,
    } as unknown as Record<string, unknown[]>;
    const entries = arrays[namespace]!;
    entries.push(structuredClone(entries[0]));
    expect(validatePack(JSON.stringify(p))).toMatchObject({ ok: false });
  });
  it.each([
    'mistake-approach',
    'mistake-test',
    'ladder',
    'followup-approach',
    'followup-source',
    'variant',
    'case-source',
    'manifest',
    'ordinal',
    'unique-pair',
    'wrong-output',
    'hidden-example',
    'empty-section',
    'candidate-size',
  ])('rejects invalid %s', (kind) => {
    const p = createApprovedPack();
    if (kind === 'mistake-approach')
      p.interview.mistakes[0]!.approachIds.push('missing');
    if (kind === 'mistake-test')
      p.interview.mistakes[0]!.testCaseIds.push('missing');
    if (kind === 'ladder') p.interview.hintLadders[0]!.approachId = 'missing';
    if (kind === 'followup-approach')
      p.interview.followups[0]!.approachIds.push('missing');
    if (kind === 'followup-source')
      p.interview.followups[0]!.sourceReferences.push('missing');
    if (kind === 'variant')
      p.interview.variants[0]!.approachIds.push('missing');
    if (kind === 'case-source')
      p.evaluation.cases[0]!.validationEvidence.sourceReferences.push(
        'missing',
      );
    if (kind === 'manifest') p.evaluation.manifest.caseIds.reverse();
    if (kind === 'ordinal') p.interview.hintLadders[0]!.hints[0]!.ordinal = 2;
    if (kind === 'unique-pair')
      p.evaluation.cases[1]!.input = { nums: [1, 1, 1], target: 2 };
    if (kind === 'wrong-output') p.evaluation.cases[0]!.expectedOutput = [0, 2];
    if (kind === 'hidden-example') p.evaluation.cases[0]!.visibility = 'hidden';
    if (kind === 'empty-section') p.interview.mistakes = [];
    if (kind === 'candidate-size')
      p.candidate.constraints = Array(10).fill('x'.repeat(32000));
    expect(validatePack(JSON.stringify(p))).toMatchObject({ ok: false });
  });
  it('requires honest draft markers and publication readiness, not detached review authority', () => {
    const p = createApprovedPack();
    const draft = { ...p, authorId: null };
    expect(validatePack(JSON.stringify(draft))).toMatchObject({
      ok: true,
      publishable: false,
    });
    expect(validatePack(JSON.stringify(draft), 'publication')).toMatchObject({
      ok: false,
    });
    p.provenance.rightsReview = {
      status: 'pending',
      evidence: null as unknown as string,
    };
    expect(validatePack(JSON.stringify(p))).toMatchObject({
      ok: true,
      publishable: false,
    });
    expect(validatePack(JSON.stringify(p), 'publication')).toMatchObject({
      ok: false,
    });
  });
  it('accepts reasoned empty optional sections', () => {
    const p = createApprovedPack();
    p.interview.mistakes = [];
    expect(
      validatePack(
        JSON.stringify({
          ...p,
          interview: {
            ...p.interview,
            emptySectionReasons: {
              mistakes: 'Synthetic fixture omits mistakes intentionally.',
            },
          },
        }),
      ),
    ).toMatchObject({ ok: true });
  });
  it('caps safe errors and does not disclose unknown keys or content', () => {
    const p = createApprovedPack();
    p.interview.followups[0]!.approachIds = Array(120).fill('private-canary');
    const result = validatePack(JSON.stringify(p));
    expect(result).toMatchObject({ ok: false, truncated: true });
    if (result.ok) return;
    expect(result.errors).toHaveLength(100);
    expect(JSON.stringify(result)).not.toContain('private-canary');
    expect(
      JSON.stringify(validatePack('{"private-canary":true}')),
    ).not.toContain('private-canary');
  });
  it('rejects malformed examples, out-of-range indices and incompatible case bounds', () => {
    for (const kind of [
      'example',
      'same-index',
      'length',
      'target',
      'data-size',
    ]) {
      const p = createApprovedPack();
      if (kind === 'example') p.candidate.examples[0]!.input = 'not JSON';
      if (kind === 'same-index') p.evaluation.cases[0]!.expectedOutput = [0, 0];
      if (kind === 'length')
        p.evaluation.cases[0]!.input.nums = Array(10001).fill(1);
      if (kind === 'target') p.evaluation.cases[0]!.input.target = 1000000001;
      if (kind === 'data-size')
        p.candidate.examples[0]!.input = 'x'.repeat(32769);
      expect(validatePack(JSON.stringify(p))).toMatchObject({ ok: false });
    }
  });
});

describe('publication content readiness', () => {
  it.each(['followup', 'variant', 'case', 'rights-evidence'])(
    'rejects unapproved %s metadata',
    (kind) => {
      const p = createApprovedPack();
      if (kind === 'followup')
        p.interview.followups[0]!.reviewStatus = 'pending';
      if (kind === 'variant') p.interview.variants[0]!.reviewStatus = 'pending';
      if (kind === 'case')
        p.evaluation.cases[0]!.validationEvidence.humanReviewStatus = 'pending';
      if (kind === 'rights-evidence')
        p.provenance.rightsReview.evidence = null as unknown as string;
      expect(validatePack(JSON.stringify(p), 'publication')).toMatchObject({
        ok: false,
      });
    },
  );
  it('returns safe root failures from raw admission and caps schema failures', () => {
    expect(validatePack('{"secret-canary":1,"secret-canary":2}')).toEqual({
      ok: false,
      errors: [{ code: 'duplicate_key', path: 'bundle' }],
      truncated: false,
    });
    const p = createApprovedPack();
    p.evaluation.cases[0]!.input.nums = Array(200).fill(
      'canary' as unknown as number,
    );
    const result = validatePack(JSON.stringify(p));
    expect(result).toMatchObject({ ok: false, truncated: true });
    if (!result.ok) expect(result.errors).toHaveLength(100);
    expect(JSON.stringify(result)).not.toContain('canary');
  });
});

describe('bounded schema diagnostics', () => {
  it('rejects 100000 invalid array elements within a real-process memory budget', async () => {
    const { execFileSync } = await import('node:child_process');
    const output = execFileSync(
      process.execPath,
      [
        '--expose-gc',
        '--import',
        'tsx',
        'tests/fixtures/problem-catalogue/schema-budget.ts',
      ],
      { encoding: 'utf8', timeout: 15000 },
    );
    const report = JSON.parse(output) as {
      extraHeapBytes: number;
      result: { ok: boolean; errors: unknown[]; truncated: boolean };
    };
    expect(report.extraHeapBytes).toBeLessThan(32 * 1024 * 1024);
    expect(report.result).toMatchObject({ ok: false, truncated: true });
    expect(report.result.errors).toHaveLength(100);
  }, 20000);
});

describe('addressable stable problem identities', () => {
  it.each([
    '.',
    '..',
    'line\nfeed',
    'tab\tname',
    'return\rname',
    'end\u007fname',
  ])(
    'rejects unaddressable problem ID %j in drafts and publications',
    (problemId) => {
      const p = { ...createApprovedPack(), problemId };
      for (const mode of ['draft', 'publication'] as const) {
        expect(validatePack(JSON.stringify(p), mode)).toMatchObject({
          ok: false,
          errors: [{ code: 'invalid_schema', path: 'problemId' }],
        });
      }
    },
  );
  it('retains Unicode problem IDs and dot-segment version labels', () => {
    const p = { ...createApprovedPack(), problemId: '问题-😀', version: '..' };
    expect(validatePack(JSON.stringify(p), 'publication')).toMatchObject({
      ok: true,
    });
  });
});
it.each(['line\nfeed', 'tab\tname', 'return\rname', 'end\u007fname'])(
  'rejects control-bearing version labels %j before they become unreadable pins',
  (version) => {
    const p = { ...createApprovedPack(), version };
    for (const mode of ['draft', 'publication'] as const) {
      expect(validatePack(JSON.stringify(p), mode)).toMatchObject({
        ok: false,
        errors: [{ code: 'invalid_schema', path: 'version' }],
      });
    }
  },
);
