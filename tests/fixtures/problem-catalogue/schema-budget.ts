import { validatePack } from '../../../src/modules/content-publishing/public';
import { createApprovedPack } from './index';

// A real-process regression budget, using no production diagnostics/test hooks.
const fixture = createApprovedPack();
const malformed = {
  ...fixture,
  evaluation: {
    ...fixture.evaluation,
    cases: Array.from({ length: 10 }, (_, i) => ({
      ...fixture.evaluation.cases[0],
      id: `invalid-${i}`,
      input: { nums: Array(10000).fill(null), target: 0 },
    })),
  },
};
const raw = JSON.stringify(malformed);
global.gc?.();
const before = process.memoryUsage().heapUsed;
const result = validatePack(raw);
const extraHeapBytes = process.memoryUsage().heapUsed - before;
console.log(JSON.stringify({ extraHeapBytes, result }));
