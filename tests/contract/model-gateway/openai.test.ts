import { expect, it } from 'vitest';
import {
  envelope,
  fixture,
  request,
  runSharedContract,
} from '../../fixtures/model-gateway/provider-harness';
import {
  openaiQuotaCodes,
  validText,
} from '../../fixtures/model-gateway/provider-cases';
runSharedContract('openai');
it('OpenAI sends Responses strict text format and store:false without tools or streaming', async () => {
  const { adapter, received } = await fixture('openai');
  expect(
    await adapter.send(request('openai'), new AbortController().signal),
  ).toMatchObject({ status: 'complete', text: validText });
  expect(received[0]).toMatchObject({
    url: 'https://api.openai.com/v1/responses',
    method: 'POST',
    authorization: 'Bearer DUMMY_PROVIDER_CANARY',
    redirect: 'manual',
  });
  expect(JSON.parse(received[0]!.body)).toEqual({
    model: 'gpt-6.1-sol',
    instructions: request('openai').prompt,
    input: [
      {
        role: 'user',
        content: [{ type: 'input_text', text: '{"text":"Synthetic fixture"}' }],
      },
    ],
    text: {
      format: {
        type: 'json_schema',
        name: 'gateway_probe',
        strict: true,
        schema: request('openai').outputJsonSchema,
      },
    },
    max_output_tokens: 1024,
    store: false,
    stream: false,
  });
});
it.each(openaiQuotaCodes)(
  'OpenAI terminal quota %s is never internally retried',
  async (code) => {
    const { adapter } = await fixture(
      'openai',
      { error: { code, type: 'insufficient_quota', message: 'SECRET_ERROR' } },
      429,
    );
    expect(
      await adapter.send(request('openai'), new AbortController().signal),
    ).toEqual({
      status: 'failure',
      code: 'quota_exhausted',
      retryable: false,
      internalRetry: false,
    });
  },
);
it('OpenAI verified throttling preserves only bounded internal Retry-After', async () => {
  const { adapter } = await fixture(
    'openai',
    {
      error: {
        code: 'slow_down',
        type: 'rate_limit_error',
        message: 'SECRET_ERROR',
      },
    },
    429,
  );
  expect(
    await adapter.send(request('openai'), new AbortController().signal),
  ).toEqual({
    status: 'failure',
    code: 'rate_limited',
    retryable: true,
    internalRetry: true,
    retryAfter: '1',
  });
});
it.each([
  [
    'incomplete tokens',
    {
      status: 'incomplete',
      incomplete_details: { reason: 'max_output_tokens' },
    },
    'truncated',
  ],
  [
    'incomplete content filter',
    { status: 'incomplete', incomplete_details: { reason: 'content_filter' } },
    'refused',
  ],
  [
    'incomplete unknown',
    { status: 'incomplete', incomplete_details: { reason: 'unknown' } },
    'failure',
  ],
  [
    'failed status',
    {
      status: 'failed',
      error: { code: 'server_error', message: 'SECRET_ERROR' },
    },
    'failure',
  ],
  ['missing output', { output: undefined }, 'failure'],
  [
    'tool beside valid text',
    {
      output: [
        {
          type: 'message',
          role: 'assistant',
          status: 'completed',
          content: [{ type: 'output_text', text: validText }],
        },
        {
          type: 'function_call',
          name: 'do_not_execute',
          arguments: '{}',
          call_id: 'owned',
        },
      ],
    },
    'tool_output',
  ],
  [
    'refusal beside valid text',
    {
      output: [
        {
          type: 'message',
          role: 'assistant',
          status: 'completed',
          content: [
            { type: 'output_text', text: validText },
            { type: 'refusal', refusal: 'SECRET_REFUSAL' },
          ],
        },
      ],
    },
    'refused',
  ],
  [
    'incomplete message',
    {
      output: [
        {
          type: 'message',
          role: 'assistant',
          status: 'incomplete',
          content: [{ type: 'output_text', text: validText }],
        },
      ],
    },
    'truncated',
  ],
  [
    'unexpected content',
    {
      output: [
        {
          type: 'message',
          role: 'assistant',
          status: 'completed',
          content: [{ type: 'audio', text: validText }],
        },
      ],
    },
    'failure',
  ],
  [
    'wrong role',
    {
      output: [
        {
          type: 'message',
          role: 'user',
          status: 'completed',
          content: [{ type: 'output_text', text: validText }],
        },
      ],
    },
    'failure',
  ],
  [
    'missing content',
    { output: [{ type: 'message', role: 'assistant', status: 'completed' }] },
    'failure',
  ],
  ['empty output', { output: [] }, 'failure'],
  ['unexpected item', { output: [{ type: 'unexpected' }] }, 'failure'],
  [
    'Chat Completions envelope',
    {
      object: 'chat.completion',
      status: undefined,
      choices: [{ finish_reason: 'stop', message: { content: validText } }],
      output: undefined,
    },
    'failure',
  ],
])(
  'OpenAI rejects %s before JSON acceptance',
  async (_name, change, status) => {
    const { adapter } = await fixture('openai', {
      ...envelope('openai'),
      ...change,
    });
    const result = await adapter.send(
      request('openai'),
      new AbortController().signal,
    );
    expect(result.status).toBe(status);
    expect(JSON.stringify(result)).not.toMatch(/SECRET_(ERROR|REFUSAL)/);
  },
);
it('OpenAI validates all text rather than accepting the first valid JSON substring', async () => {
  const body = envelope('openai');
  body.output = [
    {
      type: 'message',
      role: 'assistant',
      status: 'completed',
      content: [
        { type: 'output_text', text: validText },
        { type: 'output_text', text: 'TRAILING_SECRET' },
      ],
    },
  ];
  const { adapter } = await fixture('openai', body);
  expect(
    await adapter.send(request('openai'), new AbortController().signal),
  ).toMatchObject({ code: 'invalid_output' });
});

it('OpenAI incomplete reasoning cannot masquerade as a completed response', async () => {
  const body = envelope('openai');
  (body.output as Record<string, unknown>[])[0]!.status = 'incomplete';
  const { adapter } = await fixture('openai', body);
  expect(
    await adapter.send(request('openai'), new AbortController().signal),
  ).toMatchObject({ status: 'truncated' });
});
it('rejects a reasoning item left in a non-terminal, non-incomplete status', async () => {
  const body = envelope('openai');
  (body.output as Record<string, unknown>[])[0]!.status = 'in_progress';
  const { adapter } = await fixture('openai', body);
  expect(
    await adapter.send(request('openai'), new AbortController().signal),
  ).toMatchObject({ status: 'failure', code: 'invalid_output' });
});
