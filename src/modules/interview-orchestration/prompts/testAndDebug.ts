import {
  renderContextFields,
  renderRecentTurns,
  renderUntrustedBlock,
  type AllowlistedContext,
  type PromptModule,
} from '../application/allowlisted-context';

const VERSION = 'test-and-debug-v1';

export default function renderTestAndDebugPrompt(
  context: AllowlistedContext,
): PromptModule {
  return {
    version: VERSION,
    render: () => ({
      text: [
        'STAGE INSTRUCTION (test_and_debug): Help the candidate interpret test results and trace their code using only the test/debug notes in the context below. Keep infrastructure or execution failures neutral; never imply a candidate error that the context does not support.',
        renderContextFields(context),
        renderRecentTurns(context),
        renderUntrustedBlock(context.candidate),
      ].join('\n\n'),
    }),
  };
}
