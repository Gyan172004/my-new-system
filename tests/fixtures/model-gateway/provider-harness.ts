import { createServer, type Server, type RequestListener } from 'node:http';
import { afterEach, expect, it } from 'vitest';
import * as gateway from '../../../src/modules/model-gateway/public';
import { createProviderTransport } from '../../../src/modules/model-gateway/adapters/transport';
import { createOperationRegistry } from '../../../src/modules/model-gateway/application/operations';
import type {
  AdapterRequest,
  GatewayAdapter,
} from '../../../src/modules/model-gateway/public';
import { httpCases, validText } from './provider-cases';
export type Provider = 'groq' | 'openai';
const servers: Server[] = [];
afterEach(async () => {
  for (const server of servers.splice(0)) {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
export function request(provider: Provider): AdapterRequest {
  const definition = createOperationRegistry().resolve('gateway_probe');
  if (!definition.ok) throw Error('registry');
  return {
    operation: 'gateway_probe',
    input: { text: 'Synthetic fixture' },
    model: provider === 'groq' ? 'openai/gpt-oss-120b' : 'gpt-6.1-sol',
    prompt: definition.definition.prompt.body,
    outputJsonSchema: definition.definition.outputJsonSchema,
    limits: definition.definition.limits,
    callId: 'call-fixture',
    attemptId: 'attempt-fixture',
    operationId: 'operation-fixture',
  };
}
export function envelope(provider: Provider): Record<string, unknown> {
  return provider === 'groq'
    ? {
        id: 'chatcmpl-owned-fixture',
        object: 'chat.completion',
        created: 1,
        model: 'openai/gpt-oss-120b',
        choices: [
          {
            index: 0,
            finish_reason: 'stop',
            logprobs: null,
            message: {
              role: 'assistant',
              content: validText,
              reasoning: 'PRIVATE_REASONING',
            },
          },
        ],
        usage: {
          prompt_tokens: 30,
          completion_tokens: 20,
          total_tokens: 50,
          prompt_tokens_details: { cached_tokens: 5 },
          completion_tokens_details: { reasoning_tokens: 12 },
        },
      }
    : {
        id: 'resp_owned_fixture',
        object: 'response',
        created_at: 1,
        model: 'gpt-6.1-sol',
        status: 'completed',
        error: null,
        incomplete_details: null,
        output: [
          { id: 'rs_owned', type: 'reasoning', summary: [] },
          {
            id: 'msg_owned',
            type: 'message',
            role: 'assistant',
            status: 'completed',
            content: [
              { type: 'output_text', text: validText, annotations: [] },
            ],
          },
        ],
        usage: {
          input_tokens: 30,
          output_tokens: 20,
          total_tokens: 50,
          input_tokens_details: { cached_tokens: 5 },
          output_tokens_details: { reasoning_tokens: 12 },
        },
      };
}
export function construct(
  provider: Provider,
  transport: ReturnType<typeof createProviderTransport>,
): GatewayAdapter {
  const name =
    provider === 'groq' ? 'createGroqAdapter' : 'createOpenAIAdapter';
  expect(gateway).toHaveProperty(name);
  return gateway[name]({ apiKey: 'DUMMY_PROVIDER_CANARY', transport });
}
export async function fixture(
  provider: Provider,
  response: unknown = envelope(provider),
  status = 200,
  contentType = 'application/json',
  handler?: RequestListener,
) {
  const received: {
    url: string;
    method?: string | undefined;
    authorization?: string | undefined;
    body: string;
    redirect?: RequestRedirect | undefined;
  }[] = [];
  const server = createServer(
    handler ??
      ((q, r) => {
        const chunks: Buffer[] = [];
        q.on('data', (chunk: Buffer) => chunks.push(chunk));
        q.on('end', () => {
          const item = received.at(-1)!;
          item.body = Buffer.concat(chunks).toString('utf8');
          item.method = q.method;
          item.authorization = q.headers.authorization;
          r.writeHead(status, {
            'content-type': contentType,
            'retry-after': '1',
          });
          r.end(
            typeof response === 'string' ? response : JSON.stringify(response),
          );
        });
      }),
  );
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw Error('fixture address');
  const local = `http://127.0.0.1:${address.port}`;
  const transport = createProviderTransport(provider, (url, init) => {
    received.push({ url: String(url), redirect: init?.redirect, body: '' });
    return fetch(local, init);
  });
  return { adapter: construct(provider, transport), received, transport };
}
export function runSharedContract(provider: Provider) {
  it.each(httpCases)(
    `${provider} wire: $name`,
    async ({ status, error, code, retryable }) => {
      const { adapter, received } = await fixture(
        provider,
        { error: { ...Object(error), message: 'SECRET_CANARY' } },
        status,
      );
      const result = await adapter.send(
        request(provider),
        new AbortController().signal,
      );
      expect(result).toMatchObject({
        status: 'failure',
        code,
        retryable,
        internalRetry: retryable,
      });
      expect(received).toHaveLength(1);
      expect(JSON.stringify(result)).not.toContain('SECRET_CANARY');
    },
  );
  it.each([
    ['wrong content type', 'text/html', '{}'],
    ['invalid JSON', 'application/json', '{"broken":'],
    ['array envelope', 'application/json', '[]'],
    ['null envelope', 'application/json', 'null'],
    ['empty envelope', 'application/json', '{}'],
    ['empty response', 'application/json', ''],
  ])(`${provider} rejects %s`, async (_name, type, body) => {
    const { adapter } = await fixture(provider, body, 200, type);
    expect(
      await adapter.send(request(provider), new AbortController().signal),
    ).toMatchObject({
      status: 'failure',
      code: 'invalid_output',
      retryable: false,
    });
  });
  it(`${provider} complete output validates through the gateway and normalizes included usage once`, async () => {
    const { adapter } = await fixture(provider);
    const engine = gateway.createModelGateway({
      adapter,
      environment: 'development',
    });
    const result = await engine.invoke({
      operation: 'gateway_probe',
      input: { text: 'Synthetic fixture' },
      context: { requestId: 'fixture', operationId: 'fixture' },
      signal: new AbortController().signal,
    });
    expect(result).toMatchObject({
      ok: true,
      data: { schemaVersion: 1, acknowledged: true },
      metadata: {
        attempts: 1,
        reportedModel: request(provider).model,
        usage: {
          completeness: 'complete',
          totals: {
            inputTokens: 30,
            outputTokens: 20,
            totalTokens: 50,
            reasoningTokens: 12,
            cachedInputTokens: 5,
          },
        },
      },
    });
    expect(JSON.stringify(result)).not.toContain('PRIVATE_REASONING');
    await engine.close();
  });
  it(`${provider} missing usage stays unknown and unknown model text stays private`, async () => {
    const body = envelope(provider);
    delete body.usage;
    body.model = 'SECRET_MODEL_CANARY';
    const { adapter } = await fixture(provider, body);
    const result = await adapter.send(
      request(provider),
      new AbortController().signal,
    );
    expect(result).toMatchObject({
      status: 'complete',
      reportedModel: null,
      usage: { inputTokens: null, outputTokens: null, totalTokens: null },
    });
    expect(JSON.stringify(result)).not.toContain('SECRET_MODEL_CANARY');
  });
  it(`${provider} rejects disabled model substitution before transport`, async () => {
    const { adapter, received } = await fixture(provider);
    expect(
      await adapter.send(
        { ...request(provider), model: 'gpt-6-astra' },
        new AbortController().signal,
      ),
    ).toMatchObject({ code: 'configuration_error' });
    expect(received).toHaveLength(0);
  });
  it(`${provider} rejects invalid input and schema replacement before transport`, async () => {
    const { adapter, received } = await fixture(provider);
    expect(
      await adapter.send(
        { ...request(provider), input: { text: '' } },
        new AbortController().signal,
      ),
    ).toMatchObject({ code: 'invalid_request' });
    expect(
      await adapter.send(
        { ...request(provider), outputJsonSchema: { type: 'string' } },
        new AbortController().signal,
      ),
    ).toMatchObject({ code: 'configuration_error' });
    expect(received).toHaveLength(0);
  });
  it(`${provider} preparation is non-billable and declares unknown token bound`, async () => {
    const { adapter, received } = await fixture(provider);
    const req = { ...request(provider), input: { text: 'Synthetic fixture' } };
    const prepared = await adapter.prepare!(req, new AbortController().signal);
    expect(prepared.inputTokenUpperBound).toBeNull();
    expect(received).toHaveLength(0);
    req.input.text = 'Changed after preparation';
    expect(await prepared.send(new AbortController().signal)).toMatchObject({
      status: 'complete',
    });
    expect(received[0]!.body).toContain('Synthetic fixture');
    expect(received[0]!.body).not.toContain('Changed after preparation');
  });
  it(`${provider} never dispatches pre-cancelled or closed calls`, async () => {
    const { adapter, received } = await fixture(provider);
    const controller = new AbortController();
    controller.abort();
    expect(
      await adapter.send(request(provider), controller.signal),
    ).toMatchObject({ code: 'cancelled' });
    await adapter.close!();
    expect(
      await adapter.send(request(provider), new AbortController().signal),
    ).toMatchObject({ code: 'cancelled' });
    expect(received).toHaveLength(0);
  });
  it(`${provider} prepared wire identity and completion cap cannot change after preparation`, async () => {
    const { adapter } = await fixture(provider);
    const req = {
      ...request(provider),
      limits: { ...request(provider).limits },
    };
    const prepared = await adapter.prepare!(req, new AbortController().signal);
    req.model = 'SECRET_MUTATED_MODEL';
    req.limits.completionTokens = 1;
    expect(await prepared.send(new AbortController().signal)).toMatchObject({
      status: 'complete',
      reportedModel:
        provider === 'groq' ? 'openai/gpt-oss-120b' : 'gpt-6.1-sol',
    });
  });
  it.each([
    'not JSON',
    '{"schemaVersion":1,"acknowledged":true,"extra":"SECRET_EXTRA"}',
    '{"schemaVersion":1,"acknowledged":false}',
    '',
  ])(`${provider} validates complete output %j`, async (text) => {
    const body = envelope(provider);
    if (provider === 'groq')
      (body.choices as { message: { content: string } }[])[0]!.message.content =
        text;
    else
      (body.output as { type: string; content?: { text: string }[] }[]).find(
        (item) => item.type === 'message',
      )!.content![0]!.text = text;
    const { adapter } = await fixture(provider, body);
    const result = await adapter.send(
      request(provider),
      new AbortController().signal,
    );
    expect(result).toMatchObject({
      status: 'failure',
      code: 'invalid_output',
      retryable: false,
    });
    expect(JSON.stringify(result)).not.toContain('SECRET_EXTRA');
  });
  it(`${provider} invalid counts stay unknown and included subtotals are bounded`, async () => {
    const body = envelope(provider);
    body.usage =
      provider === 'groq'
        ? {
            prompt_tokens: -1,
            completion_tokens: 2.5,
            total_tokens: '50',
            completion_tokens_details: { reasoning_tokens: 100 },
            prompt_tokens_details: { cached_tokens: 100 },
            secret: 'SECRET_USAGE',
          }
        : {
            input_tokens: -1,
            output_tokens: 2.5,
            total_tokens: '50',
            output_tokens_details: { reasoning_tokens: 100 },
            input_tokens_details: { cached_tokens: 100 },
            secret: 'SECRET_USAGE',
          };
    const { adapter } = await fixture(provider, body);
    const result = await adapter.send(
      request(provider),
      new AbortController().signal,
    );
    expect(result).toMatchObject({
      status: 'complete',
      usage: {
        inputTokens: null,
        outputTokens: null,
        totalTokens: null,
        reasoningTokens: null,
        cachedInputTokens: null,
        completeness: 'unknown',
      },
    });
    expect(JSON.stringify(result)).not.toContain('SECRET_USAGE');
  });
  it(`${provider} usage over the completion cap rejects otherwise valid output`, async () => {
    const body = envelope(provider);
    body.usage =
      provider === 'groq'
        ? { completion_tokens: 1025 }
        : { output_tokens: 1025 };
    const { adapter } = await fixture(provider, body);
    expect(
      await adapter.send(request(provider), new AbortController().signal),
    ).toMatchObject({ status: 'truncated', usage: { outputTokens: 1025 } });
  });
  it(`${provider} invalid included subtotals remain partial after gateway normalization`, async () => {
    const body = envelope(provider);
    const usage = body.usage as Record<string, unknown>;
    if (provider === 'groq') {
      usage.completion_tokens_details = { reasoning_tokens: 100 };
      usage.prompt_tokens_details = { cached_tokens: 100 };
    } else {
      usage.output_tokens_details = { reasoning_tokens: 100 };
      usage.input_tokens_details = { cached_tokens: 100 };
    }
    const { adapter } = await fixture(provider, body);
    const engine = gateway.createModelGateway({
      adapter,
      environment: 'development',
    });
    const result = await engine.invoke({
      operation: 'gateway_probe',
      input: { text: 'Synthetic fixture' },
      context: { requestId: 'fixture', operationId: 'fixture' },
      signal: new AbortController().signal,
    });
    expect(result).toMatchObject({
      ok: true,
      metadata: {
        usage: {
          completeness: 'partial',
          partialAttempts: 1,
          totals: {
            inputTokens: 30,
            outputTokens: 20,
            totalTokens: 50,
            reasoningTokens: null,
            cachedInputTokens: null,
          },
          attempts: [{ usage: { completeness: 'partial' } }],
        },
      },
    });
    await engine.close();
  });
}
