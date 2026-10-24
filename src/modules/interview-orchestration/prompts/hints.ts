import {
  renderContextFields,
  renderRecentTurns,
  renderUntrustedBlock,
  type AllowlistedContext,
  type PromptModule,
} from '../application/allowlisted-context';

const VERSION = 'hints-v1';

export default function renderHintsPrompt(
  context: AllowlistedContext,
): PromptModule {
  return {
    version: VERSION,
    render: () => ({
      text: [
        'STAGE INSTRUCTION (hints): You may discuss only the hint-ladder content already supplied in the context below. You must never invent a stronger hint, reveal a later hint than what is supplied, or disclose the full reference solution, hidden tests, or expected hidden outputs (mirrors llm_interaction_policy.md section 6).',
        renderContextFields(context),
        renderRecentTurns(context),
        renderUntrustedBlock(context.candidate),
      ].join('\n\n'),
    }),
  };
}
