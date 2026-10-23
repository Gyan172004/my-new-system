import { normalizeUsage } from '../application/metadata';
import {
  adapterFailure,
  createTextAdapter,
  providerRecord,
  type TextAdapterOptions,
} from './transport';
// Responses uses a complete output-item array, not Chat Completions choices.
// https://developers.openai.com/api/reference/resources/responses/methods/create
export function createOpenAIAdapter(options: TextAdapterOptions) {
  return createTextAdapter(
    'openai',
    options,
    (request) => ({
      model: request.model,
      instructions: request.prompt,
      input: [
        {
          role: 'user',
          content: [
            { type: 'input_text', text: JSON.stringify(request.input) },
          ],
        },
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'gateway_probe',
          strict: true,
          schema: request.outputJsonSchema,
        },
      },
      max_output_tokens: request.limits.completionTokens,
      store: false,
      stream: false,
    }),
    (body, request) => {
      const raw = providerRecord(body.usage);
      const usage = normalizeUsage({
        inputTokens: raw.input_tokens,
        outputTokens: raw.output_tokens,
        totalTokens: raw.total_tokens,
        reasoningTokens: providerRecord(raw.output_tokens_details)
          .reasoning_tokens,
        cachedInputTokens: providerRecord(raw.input_tokens_details)
          .cached_tokens,
      });
      const metadata = {
        usage,
        reportedModel: body.model === request.model ? request.model : null,
      };
      const invalid = () => ({
        ...adapterFailure('invalid_output'),
        ...metadata,
      });
      if (body.object !== 'response') return invalid();
      if (body.status === 'incomplete') {
        const reason = providerRecord(body.incomplete_details).reason;
        if (reason === 'max_output_tokens')
          return { status: 'truncated', ...metadata };
        if (reason === 'content_filter')
          return { status: 'refused', ...metadata };
        return invalid();
      }
      if (
        body.status !== 'completed' ||
        body.error != null ||
        body.incomplete_details != null ||
        !Array.isArray(body.output) ||
        !body.output.length
      )
        return invalid();
      const items = body.output.map(providerRecord);
      if (
        items.some(
          (item) =>
            typeof item.type === 'string' && /(?:call|tool)/.test(item.type),
        )
      )
        return { status: 'tool_output', ...metadata };
      const messages = items.filter((item) => item.type === 'message');
      // Inspect every content item before accepting any parseable text.
      if (
        messages.some(
          (item) =>
            Array.isArray(item.content) &&
            item.content.some(
              (part) => providerRecord(part).type === 'refusal',
            ),
        )
      )
        return { status: 'refused', ...metadata };
      if (items.some((item) => item.status === 'incomplete'))
        return { status: 'truncated', ...metadata };
      if (
        items.some(
          (item) => item.type !== 'message' && item.type !== 'reasoning',
        ) ||
        messages.length !== 1
      )
        return invalid();
      if (
        items.some(
          (item) =>
            item.type === 'reasoning' &&
            item.status != null &&
            item.status !== 'completed',
        )
      )
        return invalid();
      const message = messages[0]!;
      if (
        message.role !== 'assistant' ||
        message.status !== 'completed' ||
        !Array.isArray(message.content) ||
        !message.content.length
      )
        return invalid();
      const content = message.content.map(providerRecord);
      if (
        content.some(
          (part) =>
            part.type !== 'output_text' || typeof part.text !== 'string',
        )
      )
        return invalid();
      const text = content.map((part) => part.text as string).join('');
      if (!text.trim()) return invalid();
      if (
        usage.outputTokens !== null &&
        usage.outputTokens > request.limits.completionTokens
      )
        return { status: 'truncated', ...metadata };
      return { status: 'complete', text, ...metadata };
    },
  );
}
