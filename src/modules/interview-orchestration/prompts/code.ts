import {
  renderContextFields,
  renderRecentTurns,
  renderUntrustedBlock,
  type AllowlistedContext,
  type PromptModule,
} from '../application/allowlisted-context';

const VERSION = 'code-v1';

export default function renderCodePrompt(
  context: AllowlistedContext,
): PromptModule {
  return {
    version: VERSION,
    render: () => ({
      text: [
        "STAGE INSTRUCTION (code): Support the candidate while they write or submit an implementation, referencing only the problem statement and constraints in the context below. Do not write the candidate's code for them.",
        renderContextFields(context),
        renderRecentTurns(context),
        renderUntrustedBlock(context.candidate),
      ].join('\n\n'),
    }),
  };
}
