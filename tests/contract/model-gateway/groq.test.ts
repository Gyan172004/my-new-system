import { expect, it } from 'vitest';
import {
  envelope,
  fixture,
  request,
  runSharedContract,
} from '../../fixtures/model-gateway/provider-harness';
runSharedContract('groq');
it('Groq sends strict Chat Completions schema, approved model and full completion cap', async () => {
  const { adapter, received } = await fixture('groq');
  expect(
    await adapter.send(request('groq'), new AbortController().signal),
  ).toMatchObject({
    status: 'complete',
    text: '{"schemaVersion":1,"acknowledged":true}',
  });
  expect(received[0]).toMatchObject({
    url: 'https://api.groq.com/openai/v1/chat/completions',
    method: 'POST',
    authorization: 'Bearer DUMMY_PROVIDER_CANARY',
    redirect: 'manual',
  });
  expect(JSON.parse(received[0]!.body)).toEqual({
    model: 'openai/gpt-oss-120b',
    messages: [
      { role: 'system', content: request('groq').prompt },
      { role: 'user', content: '{"text":"Synthetic fixture"}' },
    ],
    max_completion_tokens: 1024,
    stream: false,
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'gateway_probe',
        strict: true,
        schema: request('groq').outputJsonSchema,
      },
    },
  });
});
it.each([
  ['length', { finish_reason: 'length' }, 'truncated'],
  [
    'refusal',
    {
      message: {
        role: 'assistant',
        content: '{"schemaVersion":1,"acknowledged":true}',
        refusal: 'SECRET_REFUSAL',
      },
    },
    'refused',
  ],
  ['content filter', { finish_reason: 'content_filter' }, 'refused'],
  [
    'tool call',
    {
      message: {
        role: 'assistant',
        content: '{"schemaVersion":1,"acknowledged":true}',
        tool_calls: [
          {
            id: 'tool',
            type: 'function',
            function: { name: 'untrusted', arguments: '{}' },
          },
        ],
      },
    },
    'tool_output',
  ],
  [
    'legacy function',
    {
      message: {
        role: 'assistant',
        content: '{}',
        function_call: { name: 'untrusted', arguments: '{}' },
      },
    },
    'tool_output',
  ],
  ['unknown finish', { finish_reason: 'unexpected' }, 'failure'],
  ['wrong role', { message: { role: 'user', content: '{}' } }, 'failure'],
  ['array content', { message: { role: 'assistant', content: [] } }, 'failure'],
])('Groq rejects %s before JSON acceptance', async (_name, change, status) => {
  const body = envelope('groq');
  const choices = body.choices as Record<string, unknown>[];
  body.choices = [{ ...choices[0], ...change }];
  const { adapter } = await fixture('groq', body);
  const result = await adapter.send(
    request('groq'),
    new AbortController().signal,
  );
  expect(result.status).toBe(status);
  expect(JSON.stringify(result)).not.toContain('SECRET_REFUSAL');
});
it('Groq does not silently choose among multiple completions', async () => {
  const body = envelope('groq');
  body.choices = [
    ...(body.choices as unknown[]),
    ...(body.choices as unknown[]),
  ];
  const { adapter } = await fixture('groq', body);
  expect(
    await adapter.send(request('groq'), new AbortController().signal),
  ).toMatchObject({ code: 'invalid_output' });
});
it('Groq cannot accept an error-bearing successful HTTP envelope', async () => {
  const { adapter } = await fixture('groq', {
    ...envelope('groq'),
    error: { code: 'server_error', message: 'SECRET_ERROR' },
  });
  const result = await adapter.send(
    request('groq'),
    new AbortController().signal,
  );
  expect(result).toMatchObject({
    status: 'failure',
    code: 'invalid_output',
    retryable: false,
  });
  expect(JSON.stringify(result)).not.toContain('SECRET_ERROR');
});
