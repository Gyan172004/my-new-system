import {
  renderContextFields,
  renderRecentTurns,
  renderUntrustedBlock,
  type AllowlistedContext,
  type PromptModule,
} from '../application/allowlisted-context';

const VERSION = 'intro-v1';

/**
 * `intro` stage: welcome the candidate and frame the session using only the
 * allowlisted `introText` field. Pure, synchronous; no I/O.
 */
export default function renderIntroPrompt(
  context: AllowlistedContext,
): PromptModule {
  return {
    version: VERSION,
    render: () => ({
      text: [
        'STAGE INSTRUCTION (intro): Welcome the candidate and frame the ' +
          'interview session using only the context below. Do not invent ' +
          'session rules, timing, or policy beyond what is supplied.',
        renderContextFields(context),
        renderRecentTurns(context),
        renderUntrustedBlock(context.candidate),
      ].join('\n\n'),
    }),
  };
}
