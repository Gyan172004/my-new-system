import { expect, it } from 'vitest';
import { checkFixture } from './fixture';
import { checkBoundaries } from '../../scripts/check-boundaries';
it('isolates findings between imported scanner invocations without altering process exit status', async () => {
  const exitCode = process.exitCode;
  const bad = await checkFixture(
    {
      'src/shared/model.ts':
        "export const call=()=>fetch('https://api.openai.com/v1/responses');",
    },
    true,
  );
  expect(bad).toMatchObject({
    exitCode: 1,
    violations: [
      { rule: 'provider-adapter-only', file: 'src/shared/model.ts' },
    ],
  });
  const good = await checkFixture(
    { 'src/shared/pure.ts': 'export const value=1;' },
    true,
  );
  expect(good).toEqual({ exitCode: 0, violations: [] });
  expect(process.exitCode).toBe(exitCode);
}, 10000);
it('returns safe unavailable analysis without leaking invalid paths', async () => {
  expect(await checkBoundaries('/nonexistent-CANARY-project')).toEqual({
    exitCode: 2,
    violations: [{ rule: 'architecture-analysis-unavailable', file: 'src' }],
  });
});
