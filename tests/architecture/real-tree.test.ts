import { expect, it } from 'vitest';
import { checkBoundaries } from '../../scripts/check-boundaries';
// Group05 cross-cutting ownership lock: the fixture-driven cases above prove each
// rule in isolation, but nothing previously asserted the real module tree stays
// clean as new cross-module edges (approach-assessment/hints-variants/conversation
// <-> interview-session/problem-catalogue/content-publishing) are added.
it('keeps the real module tree free of module/provider/execution boundary violations', async () => {
  const result = await checkBoundaries('.');
  expect(result).toEqual({ violations: [], exitCode: 0 });
}, 15000);
