import { expect, it } from 'vitest';
import {
  parseHintRouting,
  validateHintRouting,
  selectHintLadder,
  parsePrivateInterview,
} from '../../../src/modules/content-publishing/public';
import { createApprovedPack } from '../../fixtures/problem-catalogue';

const catalogue = {
  approachIds: ['hash', 'sort', 'other'],
  ladders: [
    { id: 'hash-a', approachId: 'hash' },
    { id: 'hash-b', approachId: 'hash' },
    { id: 'sort-a', approachId: 'sort' },
  ],
};
const manifest = () => ({
  schemaVersion: 1,
  problemId: 'two-sum',
  packVersion: '1',
  packChecksum: 'a'.repeat(64),
  revision: 'routing-v1',
  authorId: '11111111-1111-4111-8111-111111111111',
  provenance: 'reviewed synthetic routing rationale',
  defaultLadderId: 'sort-a',
  approachLadders: [
    { approachId: 'hash', ladderId: 'hash-b' },
    { approachId: 'sort', ladderId: 'sort-a' },
  ],
});
it('redacts malformed object serialization failures', () => {
  const cycle: { self?: unknown } = {};
  cycle.self = cycle;
  let getterRan = false;
  const accessor = Object.defineProperty({}, 'problemId', {
    get() {
      getterRan = true;
      throw Error('PRIVATE_CANARY');
    },
    enumerable: true,
  });
  for (const value of [
    cycle,
    1n,
    Object.create(manifest()),
    accessor,
    {
      toJSON() {
        throw Error('PRIVATE_CANARY');
      },
    },
  ]) {
    expect(() => parseHintRouting(value)).toThrow('hint_routing_unavailable');
  }
  expect(getterRan).toBe(false);
});
it('treats empty required content and corrupt ladder ordinals as dependency failures', () => {
  const interview = createApprovedPack().interview;
  for (const change of [
    { approaches: [] },
    { hintLadders: [] },
    { hintLadders: [{ ...interview.hintLadders[0], hints: [] }] },
    { hintLadders: [{ ...interview.hintLadders[0], approachId: 'missing' }] },
  ]) {
    expect(() => parsePrivateInterview({ ...interview, ...change })).toThrow(
      'pinned_content_unavailable',
    );
  }
  const corrupt = structuredClone(interview);
  corrupt.hintLadders[0]!.hints[0]!.ordinal = 2;
  expect(() => parsePrivateInterview(corrupt)).toThrow(
    'pinned_content_unavailable',
  );
});
it('requires explicit reviewed choices across multiple ladders and uses reviewed default only where permitted', () => {
  const route = validateHintRouting(parseHintRouting(manifest()), catalogue);
  expect(selectHintLadder(route, catalogue, 'hash')).toBe('hash-b');
  expect(selectHintLadder(route, catalogue, 'sort')).toBe('sort-a');
  expect(selectHintLadder(route, catalogue, 'other')).toBe('sort-a');
  expect(selectHintLadder(route, catalogue, null)).toBe('sort-a');
  expect(() => selectHintLadder(route, catalogue, 'invented')).toThrow(
    'hint_routing_unavailable',
  );
  expect(Object.isFrozen(route.approachLadders)).toBe(true);
});
it.each([
  { defaultLadderId: '' },
  { defaultLadderId: 'absent' },
  { packChecksum: 'invalid' },
  { approachLadders: [{ approachId: 'hash', ladderId: 'sort-a' }] },
  { approachLadders: [{ approachId: 'sort', ladderId: 'sort-a' }] },
  {
    approachLadders: [
      ...manifest().approachLadders,
      { approachId: 'hash', ladderId: 'hash-a' },
    ],
  },
  { unknown: 'private' },
])('rejects invalid, incomplete or ambiguous routing %j', (change) => {
  expect(() =>
    validateHintRouting(
      parseHintRouting({ ...manifest(), ...change }),
      catalogue,
    ),
  ).toThrow();
});
