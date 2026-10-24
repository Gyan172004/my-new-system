import { describe, expect, it } from 'vitest';
import { createApprovedPack } from '../../fixtures/problem-catalogue';

import { packSchema } from '../../../src/modules/content-publishing/domain/pack-schema';

describe('strict version-one pack schema', () => {
  it('provides a strict runtime schema for a reusable synthetic problem', () => {
    expect(packSchema.safeParse(createApprovedPack()).success).toBe(true);
  });
  it.each(['top', 'candidate', 'approach', 'manifest', 'case', 'provenance'])(
    'rejects unknown %s fields',
    (kind) => {
      const pack = createApprovedPack();
      const objects: Record<string, object> = {
        top: pack,
        candidate: pack.candidate,
        approach: pack.interview.approaches[0]!,
        manifest: pack.evaluation.manifest,
        case: pack.evaluation.cases[0]!,
        provenance: pack.provenance,
      };
      Object.assign(objects[kind]!, { unrecognized: 'private-canary' });
      expect(packSchema.safeParse(pack).success).toBe(false);
    },
  );
  it.each([
    'schema',
    'category',
    'rule',
    'checker',
    'profile',
    'executable',
    'difficulty',
    'missing',
    'bytes',
  ])('rejects unsupported %s', (kind) => {
    const pack = createApprovedPack();
    if (kind === 'schema') pack.schemaVersion = 2;
    if (kind === 'category')
      pack.evaluation.cases[0]!.category = 'unregistered';
    if (kind === 'rule')
      pack.interview.hintLadders[0]!.hints[0]!.eligibilityRule.ruleId =
        'run-code';
    if (kind === 'checker') pack.evaluation.manifest.checkerId = '/tmp/run.py';
    if (kind === 'profile')
      pack.evaluation.manifest.inputProfileId = 'arbitrary';
    if (kind === 'executable') pack.interview.variants[0]!.executable = true;
    if (kind === 'difficulty') pack.candidate.difficulty = 'arbitrary';
    if (kind === 'missing') Reflect.deleteProperty(pack.candidate, 'statement');
    if (kind === 'bytes') pack.problemId = '😀'.repeat(65);
    expect(packSchema.safeParse(pack).success).toBe(false);
  });
});

describe('byte and collection boundaries', () => {
  it('rejects a URL above the prose UTF8 byte limit even below character limit', () => {
    const p = createApprovedPack();
    p.provenance.externalReferences[0]!.url =
      'https://example.com/' + 'é'.repeat(20000);
    expect(packSchema.safeParse(p).success).toBe(false);
  });
  it('rejects blank required prose and oversized content-entry arrays', () => {
    const p = createApprovedPack();
    p.candidate.statement = '   ';
    expect(packSchema.safeParse(p).success).toBe(false);
    p.candidate.statement = 'Valid';
    p.candidate.topicTags = Array(2001).fill('array');
    expect(packSchema.safeParse(p).success).toBe(false);
  });
});

describe('required nested profile fields', () => {
  it.each([
    'candidate.statement',
    'interview.approaches.0.correctness',
    'interview.approaches.0.complexity.time',
    'interview.hintLadders.0.hints.0.intendedConcept',
    'interview.followups.0.evaluationGuidance',
    'interview.variants.0.reasoningOnlyReason',
    'interview.rubric.dimensions.0.strong',
    'evaluation.cases.0.validationEvidence.dataCheck',
    'provenance.sources.0.sha256',
  ])('rejects missing %s', (path) => {
    const p = createApprovedPack();
    const parts = path.split('.');
    let parent: unknown = p;
    for (const part of parts.slice(0, -1))
      parent = (parent as Record<string, unknown>)[part];
    Reflect.deleteProperty(parent as object, parts.at(-1)!);
    expect(packSchema.safeParse(p).success).toBe(false);
  });
  it('permits an explicitly null draft author but rejects invalid UUID claims', () => {
    const p = createApprovedPack();
    expect(packSchema.safeParse({ ...p, authorId: null }).success).toBe(true);
    expect(
      packSchema.safeParse({ ...p, authorId: 'claimed-author' }).success,
    ).toBe(false);
  });
});
