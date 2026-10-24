import {
  renderContextFields,
  renderRecentTurns,
  renderUntrustedBlock,
  type AllowlistedContext,
  type PromptModule,
} from '../application/allowlisted-context';

const VERSION = 'problem-read-and-clarify-v1';

export default function renderProblemReadAndClarifyPrompt(
  context: AllowlistedContext,
): PromptModule {
  return {
    version: VERSION,
    render: () => ({
      text: [
        'STAGE INSTRUCTION (problem_read_and_clarify): Present the problem statement, examples, and constraints from the context below, and answer clarifying questions using only that context. Never reveal hidden tests, expected hidden outputs, or reviewer notes, and never answer from content not present below.',
        renderContextFields(context),
        renderRecentTurns(context),
        renderUntrustedBlock(context.candidate),
      ].join('\n\n'),
    }),
  };
}
