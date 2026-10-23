// Deterministic fallback (tech_design.md §5 / FR-007). Each prompt-bearing
// stage declares exactly one canonical, static, candidate-visible fallback
// turn. Fallback never advances `currentStage`; the caller treats a
// fallback result identically to "no proposal available this turn."

import {
  PROMPT_BEARING_STAGES,
  isPromptBearingStage,
  type InterviewStage,
  type PromptBearingStage,
} from './allowlisted-context';

export interface FallbackTurn {
  readonly responseText: string;
  readonly allowedAction: 'continue' | 'request_clarification';
}

/**
 * The 14 canonical fallback turns, one per prompt-bearing stage
 * (tech_design.md §5: "Each stage declares exactly one canonical fallback
 * turn"). `created`/`completed` are deliberately absent: they never call
 * the model and so never need a fallback.
 */
export const FALLBACK_TURN: Readonly<Record<PromptBearingStage, FallbackTurn>> =
  Object.freeze({
    intro: {
      responseText:
        "Let's get started. Take a moment, then tell me a bit about your background when you're ready.",
      allowedAction: 'continue',
    },
    experience_context: {
      responseText:
        "Thanks for sharing that. Let's move on to the problem whenever you're ready.",
      allowedAction: 'continue',
    },
    problem_read_and_clarify: {
      responseText:
        'Take your time reading through the problem. Let me know if anything in the statement is unclear.',
      allowedAction: 'request_clarification',
    },
    problem_restatement: {
      responseText:
        'Could you restate the problem in your own words so we can confirm we are aligned?',
      allowedAction: 'request_clarification',
    },
    sample_trace: {
      responseText:
        'Go ahead and walk through one of the sample examples step by step.',
      allowedAction: 'continue',
    },
    initial_approach: {
      responseText:
        'What approach are you thinking of taking first? Walk me through your reasoning.',
      allowedAction: 'continue',
    },
    approach_clarification: {
      responseText:
        'Could you clarify a bit more about how your approach handles this case?',
      allowedAction: 'request_clarification',
    },
    hints: {
      responseText:
        "Let's pause here for a moment. What part of the problem would you like to think through together?",
      allowedAction: 'continue',
    },
    code: {
      responseText:
        'Go ahead and start writing the code for your approach whenever you are ready.',
      allowedAction: 'continue',
    },
    test_and_debug: {
      responseText:
        'Try running through your code with a test case and see if the output matches what you expect.',
      allowedAction: 'continue',
    },
    improve_approach: {
      responseText:
        'Is there anything about the time or space complexity of your solution you would like to improve?',
      allowedAction: 'continue',
    },
    variants_and_followups: {
      responseText:
        'Here is a variant of the original problem to consider, or let me know if you would like to skip this.',
      allowedAction: 'continue',
    },
    complexity_analysis: {
      responseText:
        'Could you walk me through the time and space complexity of your final solution?',
      allowedAction: 'request_clarification',
    },
    feedback: {
      responseText:
        'That wraps up the interview. Thank you for walking through your thinking with me today.',
      allowedAction: 'continue',
    },
  });

/**
 * Returns the canonical fallback turn for `stage`. Throws for a
 * non-prompt-bearing stage (`created`/`completed`), reusing the same
 * runtime guard `allowlisted-context.ts` uses (`isPromptBearingStage`)
 * rather than duplicating the check here.
 */
export function selectFallback(stage: InterviewStage): FallbackTurn {
  if (!isPromptBearingStage(stage)) {
    throw new Error(
      `selectFallback: stage "${stage}" is not prompt-bearing and never ` +
        'calls the model, so it has no fallback turn (session_state_machine.md §2).',
    );
  }
  return FALLBACK_TURN[stage];
}

// Defensive consistency check: every prompt-bearing stage must have an
// entry. (Typechecking against Record<PromptBearingStage, FallbackTurn>
// already enforces this at compile time; this is a cheap runtime
// corroboration kept intentionally small.)
for (const stage of PROMPT_BEARING_STAGES) {
  if (!(stage in FALLBACK_TURN)) {
    throw new Error(`FALLBACK_TURN is missing an entry for stage "${stage}"`);
  }
}
