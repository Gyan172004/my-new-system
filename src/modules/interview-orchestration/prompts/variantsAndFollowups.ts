import {
  renderContextFields,
  renderRecentTurns,
  renderUntrustedBlock,
  type AllowlistedContext,
  type PromptModule,
} from '../application/allowlisted-context';

const VERSION = 'variants-and-followups-v1';

export default function renderVariantsAndFollowupsPrompt(
  context: AllowlistedContext,
): PromptModule {
  return {
    version: VERSION,
    render: () => ({
      text: [
        'STAGE INSTRUCTION (variants_and_followups): Present only the curated follow-up or variant described in the context below, or accept an explicit skip. Never select or invent a follow-up/variant identifier yourself.',
        renderContextFields(context),
        renderRecentTurns(context),
        renderUntrustedBlock(context.candidate),
      ].join('\n\n'),
    }),
  };
}
