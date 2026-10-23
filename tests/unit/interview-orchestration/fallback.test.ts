import { describe, expect, it } from 'vitest';
import {
  FALLBACK_TURN,
  selectFallback,
} from '../../../src/modules/interview-orchestration/application/fallback';
import { PROMPT_BEARING_STAGES } from '../../../src/modules/interview-orchestration/application/allowlisted-context';

describe('FALLBACK_TURN / selectFallback', () => {
  it('declares exactly one canonical fallback turn for each of the 14 prompt-bearing stages', () => {
    for (const stage of PROMPT_BEARING_STAGES) {
      const turn = FALLBACK_TURN[stage];
      expect(turn).toBeDefined();
      expect(typeof turn.responseText).toBe('string');
      expect(turn.responseText.length).toBeGreaterThan(0);
      expect(['continue', 'request_clarification']).toContain(
        turn.allowedAction,
      );
    }
  });

  it('selectFallback returns the exact static entry registered in FALLBACK_TURN for several stages', () => {
    for (const stage of [
      'intro',
      'hints',
      'code',
      'feedback',
      'variants_and_followups',
    ] as const) {
      expect(selectFallback(stage)).toBe(FALLBACK_TURN[stage]);
    }
  });

  it('throws for the non-prompt-bearing "created" stage', () => {
    expect(() => selectFallback('created')).toThrow();
  });

  it('throws for the non-prompt-bearing "completed" stage', () => {
    expect(() => selectFallback('completed')).toThrow();
  });

  it('every stage has a distinct responseText (no accidental copy-paste collisions)', () => {
    const texts = PROMPT_BEARING_STAGES.map(
      (stage) => FALLBACK_TURN[stage].responseText,
    );
    expect(new Set(texts).size).toBe(texts.length);
  });
});
