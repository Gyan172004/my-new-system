export const policyVersion = 'hint-selection-v1';
export interface PinnedHint {
  readonly id: string;
  readonly ordinal: number;
  readonly text: string;
}
export interface PinnedLadder {
  readonly id: string;
  readonly approachId: string;
  readonly hints: readonly PinnedHint[];
}
export function nextHint(ladder: PinnedLadder, exposedCount: number): PinnedHint {
  if (!Number.isInteger(exposedCount) || exposedCount < 0)
    throw Error('hint_ladder_corrupt');
  if (!ladder.hints.length) throw Error('hint_ladder_empty');
  const ordered = [...ladder.hints].sort((a, b) => a.ordinal - b.ordinal);
  if (ordered.some((hint, index) => hint.ordinal !== index + 1))
    throw Error('hint_ladder_corrupt');
  if (exposedCount >= ordered.length) throw Error('hints_exhausted');
  return ordered[exposedCount]!;
}
