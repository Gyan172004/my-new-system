import { normalizeUsage } from '../application/metadata';
import {
  adapterFailure,
  createTextAdapter,
  providerRecord,
  type TextAdapterOptions,
} from './transport';
// Chat Completions is intentionally isolated from OpenAI Responses decoding.
// https://console.groq.com/docs/api-reference ; /docs/structured-outputs
export function createGroqAdapter(options: TextAdapterOptions) {
  return createTextAdapter(
    'groq',
    options,
    (request) => ({
      model: request.model,
      messages: [
        { role: 'system', content: request.prompt },
        { role: 'user', content: JSON.stringify(request.input) },
      ],
      max_completion_tokens: request.limits.completionTokens,
      stream: false,
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'gateway_probe',
          strict: true,
          schema: request.outputJsonSchema,
        },
      },
    }),
    (body, request) => {
      const raw = providerRecord(body.usage);
      const usage = normalizeUsage({
        inputTokens: raw.prompt_tokens,
        outputTokens: raw.completion_tokens,
        totalTokens: raw.total_tokens,
        reasoningTokens: providerRecord(raw.completion_tokens_details)
          .reasoning_tokens,
        cachedInputTokens: providerRecord(raw.prompt_tokens_details)
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
      if (
        body.object !== 'chat.completion' ||
        body.error != null ||
        !Array.isArray(body.choices) ||
        body.choices.length !== 1
      )
        return invalid();
      const choice = providerRecord(body.choices[0]);
      const message = providerRecord(choice.message);
      if (message.refusal != null && message.refusal !== '')
        return { status: 'refused', ...metadata };
      if (choice.finish_reason === 'content_filter')
        return { status: 'refused', ...metadata };
      if (choice.finish_reason === 'length')
        return { status: 'truncated', ...metadata };
      if (
        choice.finish_reason === 'tool_calls' ||
        choice.finish_reason === 'function_call' ||
        message.function_call != null ||
        (message.tool_calls != null &&
          (!Array.isArray(message.tool_calls) || message.tool_calls.length > 0))
      )
        return { status: 'tool_output', ...metadata };
      if (
        choice.index !== 0 ||
        choice.finish_reason !== 'stop' ||
        message.role !== 'assistant' ||
        typeof message.content !== 'string' ||
        !message.content.trim()
      )
        return invalid();
      if (
        usage.outputTokens !== null &&
        usage.outputTokens > request.limits.completionTokens
      )
        return { status: 'truncated', ...metadata };
      return { status: 'complete', text: message.content, ...metadata };
    },
  );
}
