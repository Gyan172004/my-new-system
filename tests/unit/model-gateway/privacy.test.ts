import { Writable } from 'node:stream';
import { afterEach, expect, it, vi } from 'vitest';
import {
  createModelGateway,
  createFakeAdapter,
  modelCallLogFields,
} from '../../../src/modules/model-gateway/public';
import {
  parseRuntimeConfig,
  parseModelGatewayConfig,
} from '../../../src/server/config';
import { createSafeLogger } from '../../../src/server/logger';
import { createSyntheticProbeRunner } from '../../../src/server/model-gateway';
import { probeContext, probeInput } from '../../fixtures/model-gateway/probe';
afterEach(() => vi.restoreAllMocks());
it('rejects caller provenance flags and hidden content fields before dispatch', async () => {
  let sends = 0;
  const gateway = createModelGateway({
    adapter: {
      provider: 'fake',
      async send() {
        sends++;
        return createFakeAdapter().send(
          {} as never,
          new AbortController().signal,
        );
      },
    },
  });
  const request = {
    operation: 'gateway_probe' as const,
    input: probeInput,
    context: probeContext,
    signal: new AbortController().signal,
  };
  for (const extra of [
    { synthetic: true },
    { hiddenTests: 'CANARY_HIDDEN' },
    { reviewerNotes: 'CANARY_REVIEW' },
    { apiKey: 'CANARY_SECRET' },
  ]) {
    expect(await gateway.invoke({ ...request, ...extra })).toMatchObject({
      code: 'invalid_request',
      metadata: { attempts: 0 },
    });
    expect(
      await gateway.invoke({ ...request, input: { ...probeInput, ...extra } }),
    ).toMatchObject({ code: 'invalid_request', metadata: { attempts: 0 } });
  }
  expect(sends).toBe(0);
});
it('trusted runner sends only its fixed synthetic fixture even with extra JavaScript arguments', async () => {
  const bodies: string[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, options) => {
    bodies.push(String(options!.body));
    return Response.json({
      object: 'chat.completion',
      model: 'openai/gpt-oss-120b',
      choices: [
        {
          index: 0,
          finish_reason: 'stop',
          message: {
            role: 'assistant',
            content: '{"schemaVersion":1,"acknowledged":true}',
          },
        },
      ],
    });
  });
  const runner = createSyntheticProbeRunner(
    parseModelGatewayConfig({
      APP_ENV: 'development',
      MODEL_GATEWAY_ADAPTER: 'groq',
      GROQ_API_KEY: 'dummy-CANARY_KEY',
    }),
    'gateway-probe-v1',
  );
  expect(
    await Reflect.apply(runner.run, runner, [
      new AbortController().signal,
      { text: 'CANARY_CANDIDATE', hidden: 'CANARY_HIDDEN' },
    ]),
  ).toMatchObject({ ok: true });
  await runner.close();
  expect(bodies).toHaveLength(1);
  const body = JSON.parse(bodies[0]!);
  expect(body.messages[1]).toEqual({
    role: 'user',
    content: '{"text":"Synthetic gateway probe v1."}',
  });
  expect(bodies.join('')).not.toContain('CANARY');
});
it('provider content and exceptions cannot escape into safe logs or result metadata', async () => {
  let output = '';
  const sink = new Writable({
    write(chunk, _encoding, done) {
      output += String(chunk);
      done();
    },
  });
  const logger = createSafeLogger(
    parseRuntimeConfig({
      APP_ENV: 'test',
      DATABASE_URL: 'postgresql://unreachable.invalid/test',
    }),
    sink,
  );
  const gateway = createModelGateway({
    onCompleted: (metadata) =>
      logger.write('model_call_completed', {
        ...modelCallLogFields(metadata),
        body: 'CANARY_BODY',
        error: Error('CANARY_ERROR'),
      }),
    adapter: {
      provider: 'fake',
      async send() {
        throw Error('CANARY_PROVIDER_SECRET');
      },
    },
  });
  const result = await gateway.invoke({
    operation: 'gateway_probe',
    input: probeInput,
    context: probeContext,
    signal: new AbortController().signal,
  });
  expect(result).toMatchObject({ code: 'configuration_error' });
  expect(JSON.stringify(result) + output).not.toContain('CANARY');
  expect(JSON.parse(output)).toMatchObject({
    event: 'model_call_completed',
    attempts: 1,
    outcome: 'configuration_error',
  });
});
