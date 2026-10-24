import { expect, it } from 'vitest';
import { nextHint, type PinnedLadder } from '../../../src/modules/hints-variants/public';

const ladder = (): PinnedLadder => ({
  id: 'ladder-1',
  approachId: 'hash',
  hints: [
    { id: 'h1', ordinal: 1, text: 'first' },
    { id: 'h2', ordinal: 2, text: 'second' },
    { id: 'h3', ordinal: 3, text: 'third' },
  ],
});

it('returns the next ordinal hint for the backend-routed local ordinal count', () => {
  const l = ladder();
  expect(nextHint(l, 0)).toMatchObject({ id: 'h1', ordinal: 1 });
  expect(nextHint(l, 1)).toMatchObject({ id: 'h2', ordinal: 2 });
  expect(nextHint(l, 2)).toMatchObject({ id: 'h3', ordinal: 3 });
});

it('tolerates out-of-order hint arrays and still returns by ordinal', () => {
  const shuffled: PinnedLadder = {
    ...ladder(),
    hints: [
      { id: 'h3', ordinal: 3, text: 'third' },
      { id: 'h1', ordinal: 1, text: 'first' },
      { id: 'h2', ordinal: 2, text: 'second' },
    ],
  };
  expect(nextHint(shuffled, 0)).toMatchObject({ id: 'h1' });
  expect(nextHint(shuffled, 1)).toMatchObject({ id: 'h2' });
});

it('throws hints_exhausted once a nonempty ladder is fully consumed', () => {
  const l = ladder();
  expect(() => nextHint(l, 3)).toThrow('hints_exhausted');
  expect(() => nextHint(l, 99)).toThrow('hints_exhausted');
});

it('rejects an empty ladder as a dependency failure', () => {
  expect(() => nextHint({ ...ladder(), hints: [] }, 0)).toThrow(
    'hint_ladder_empty',
  );
});

it('rejects corrupt ordinals (gaps, duplicates, non-contiguous) as a dependency failure', () => {
  expect(() =>
    nextHint({ ...ladder(), hints: [{ id: 'h1', ordinal: 2, text: 'x' }] }, 0),
  ).toThrow('hint_ladder_corrupt');
  expect(() =>
    nextHint(
      {
        ...ladder(),
        hints: [
          { id: 'h1', ordinal: 1, text: 'x' },
          { id: 'h2', ordinal: 1, text: 'y' },
        ],
      },
      0,
    ),
  ).toThrow('hint_ladder_corrupt');
});

it('rejects a negative or non-integer exposed count as corrupt', () => {
  const l = ladder();
  expect(() => nextHint(l, -1)).toThrow('hint_ladder_corrupt');
  expect(() => nextHint(l, 1.5)).toThrow('hint_ladder_corrupt');
});
