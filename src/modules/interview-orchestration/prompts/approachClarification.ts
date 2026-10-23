import {
  renderContextFields,
  renderRecentTurns,
  renderUntrustedBlock,
  type AllowlistedContext,
  type PromptModule,
} from '../application/allowlisted-context';

const VERSION = 'approach-clarification-v1';

export default function renderApproachClarificationPrompt(
  context: AllowlistedContext,
): PromptModule {
  return {
    version: VERSION,
    render: () => ({
      text: [
        "STAGE INSTRUCTION (approach_clarification): Resolve ambiguity in the candidate's proposed approach using only the approach notes in the context below. Ask a targeted clarifying question; never force-match the candidate's approach to a reference solution.",
        renderContextFields(context),
        renderRecentTurns(context),
        renderUntrustedBlock(context.candidate),
      ].join('\n\n'),
    }),
  };
}
