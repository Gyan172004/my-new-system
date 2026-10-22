import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { validatePack } from '../../../src/modules/content-publishing/public';
import { createApprovedPack } from '../../fixtures/problem-catalogue';
import intake from '../../../content/problem-packs/two-sum/intake-report.json';

const directory = new URL(
  '../../../content/problem-packs/two-sum/',
  import.meta.url,
);
describe('preserved owner seed and reusable fixture', () => {
  it('validates all 37 real data cases including length 10000 without granting publication', () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new Error('unexpected network'));
    try {
      const raw = readFileSync(new URL('pack.draft.json', directory));
      const result = validatePack(raw);
      expect(result).toMatchObject({ ok: true, publishable: false });
      if (!result.ok) return;
      expect(result.pack.authorId).toBeNull();
      expect(result.pack.evaluation.cases).toHaveLength(37);
      expect(
        result.pack.evaluation.cases.some((c) => c.input.nums.length === 10000),
      ).toBe(true);
      expect(
        result.pack.interview.approaches.find(
          (a) => a.id === 'sort-two-pointers',
        )?.complexity.time,
      ).toContain('n log n');
      expect(validatePack(raw, 'publication')).toMatchObject({ ok: false });
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
    }
  });
  it('preserves original bytes and independently recorded SHA256 values', () => {
    for (const file of intake.files) {
      const bytes = readFileSync(new URL(file.path, directory));
      expect(bytes.length).toBe(file.bytes);
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(
        file.sha256,
      );
    }
  });
  it('accepts another problem identity using the same profile without title branching', () => {
    const fixture = createApprovedPack();
    fixture.problemId = 'independent-fixture';
    fixture.slug = 'independent-fixture';
    fixture.candidate.title = 'Different synthetic title';
    expect(validatePack(JSON.stringify(fixture), 'publication')).toMatchObject({
      ok: true,
      publishable: true,
    });
  });
});
