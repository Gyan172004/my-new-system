import { expect, it } from 'vitest';
import cases from './fixtures/cases.json';
import { checkFixture } from './fixture';

for (const [name, fixture] of Object.entries(cases).filter(
  ([name]) => !name.startsWith('client_'),
)) {
  it(`enforces module/provider/execution ownership: ${name}`, async () => {
    const result = await checkFixture(fixture.files);
    if ('rule' in fixture) {
      expect(result.exitCode).toBe(1);
      expect(result.violations).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ rule: fixture.rule }),
        ]),
      );
    } else {
      expect(result.exitCode).toBe(0);
      expect(result.violations).toEqual([]);
    }
  }, 15000);
}
