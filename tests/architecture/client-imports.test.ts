import { expect, it } from 'vitest';
import cases from './fixtures/cases.json';
import { checkFixture } from './fixture';
for (const [name, fixture] of Object.entries(cases).filter(([name]) =>
  name.startsWith('client_'),
)) {
  it(`rejects a client dependency/secret leak: ${name}`, async () => {
    const result = await checkFixture(fixture.files);
    expect(result.exitCode).toBe(1);
    expect(result.violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ rule: 'client-server-boundary' }),
      ]),
    );
  }, 15000);
}
