import { expect, expectTypeOf, it } from 'vitest';
import {
  createModelGateway,
  createFakeAdapter,
  type GatewayAdapter,
  type GatewayRequest,
  type AdapterResult,
} from '../../../src/modules/model-gateway/public';
import { createOperationRegistry } from '../../../src/modules/model-gateway/application/operations';
import {
  probeInput,
  probeOutput,
  probeContext,
} from '../../fixtures/model-gateway/probe';

function request(): GatewayRequest<'gateway_probe'> {
  return {
    operation: 'gateway_probe',
    input: probeInput,
    context: probeContext,
    signal: new AbortController().signal,
  };
}
it('returns only an exact typed proposal and finalized safe versions/correlation, never state changes', async () => {
  const result = await createModelGateway({
    adapter: createFakeAdapter(),
  }).invoke(request());
  expect(result).toMatchObject({
    ok: true,
    data: probeOutput,
    metadata: {
      operation: 'gateway_probe',
      provider: 'fake',
      configuredModel: 'fake-probe-v1',
      reportedModel: 'fake-probe-v1',
      requestId: probeContext.requestId,
      operationId: probeContext.operationId,
      inputSchemaVersion: '1',
      outputSchemaVersion: '1',
      promptVersion: '1',
      evaluationVersion: 'synthetic-probe-v1',
      attempts: 1,
      outcome: 'success',
      usage: {
        completeness: 'unknown',
        unknownAttempts: 1,
        totals: { inputTokens: null, outputTokens: null, totalTokens: null },
      },
      estimatedCostUsd: null,
      actualCharge: 'unknown',
    },
  });
  expect(result.metadata.durationMs).toBeGreaterThanOrEqual(0);
  expect(result.metadata.callId).toMatch(/^[0-9a-f-]{36}$/);
  expect(Object.keys(result).sort()).toEqual(['data', 'metadata', 'ok']);
  if (result.ok)
    expectTypeOf(result.data).toEqualTypeOf<
      Readonly<{ schemaVersion: 1; acknowledged: true }>
    >();
});

it.each([
  [{ operation: 'not_registered' }, 'unsupported_operation'],
  [{ operation: 'speech' }, 'operation_disabled'],
  [{ input: { text: '' } }, 'invalid_request'],
  [
    { input: { text: 'synthetic', hiddenTests: 'PRIVATE_CANARY' } },
    'invalid_request',
  ],
  [{ context: { ...probeContext, requestId: '' } }, 'invalid_request'],
  [
    { context: { ...probeContext, privateNotes: 'PRIVATE_CANARY' } },
    'invalid_request',
  ],
  [{ provider: 'openai' }, 'invalid_request'],
  [{ model: 'gpt-6-astra' }, 'invalid_request'],
  [{ url: 'https://untrusted.invalid' }, 'invalid_request'],
  [{ synthetic: true }, 'invalid_request'],
  [{ signal: undefined }, 'invalid_request'],
] as const)(
  'rejects preflight with no adapter dispatch',
  async (patch, code) => {
    let dispatches = 0;
    const adapter: GatewayAdapter = {
      provider: 'fake',
      async send() {
        dispatches++;
        return {
          status: 'complete',
          text: JSON.stringify(probeOutput),
          reportedModel: null,
          usage: null,
        };
      },
    };
    const result = await createModelGateway({ adapter }).invoke({
      ...request(),
      ...patch,
    } as unknown as GatewayRequest<'gateway_probe'>);
    expect(result).toMatchObject({
      ok: false,
      code,
      retryable: false,
      metadata: { attempts: 0, outcome: code },
    });
    expect(dispatches).toBe(0);
    expect(JSON.stringify(result)).not.toContain('PRIVATE_CANARY');
    expect(JSON.stringify(result)).not.toContain('untrusted.invalid');
  },
);
it('uses fixed unknown labels for unregistered user-supplied operation names', async () => {
  const result = await createModelGateway({
    adapter: createFakeAdapter(),
  }).invoke({
    ...request(),
    operation: 'SECRET_CANARY',
  } as unknown as GatewayRequest<'gateway_probe'>);
  expect(result.metadata).toMatchObject({
    operation: 'unknown',
    promptVersion: null,
    configuredModel: null,
  });
  expect(JSON.stringify(result)).not.toContain('SECRET_CANARY');
});
it('fails incomplete registry declarations before dispatch', async () => {
  const result = await createModelGateway({
    adapter: createFakeAdapter(),
    registry: createOperationRegistry([]),
  }).invoke(request());
  expect(result).toMatchObject({
    ok: false,
    code: 'operation_disabled',
    metadata: { attempts: 0 },
  });
});
it.each([
  [
    { status: 'complete', text: '', reportedModel: null, usage: null },
    'invalid_output',
  ],
  [
    { status: 'complete', text: '{', reportedModel: null, usage: null },
    'invalid_output',
  ],
  [
    {
      status: 'complete',
      text: '{"schemaVersion":1,"acknowledged":true,"hint":"PRIVATE_CANARY"}',
      reportedModel: null,
      usage: null,
    },
    'invalid_output',
  ],
  [
    {
      status: 'complete',
      text: '{"schemaVersion":1,"acknowledged":false}',
      reportedModel: null,
      usage: null,
    },
    'invalid_output',
  ],
  [{ status: 'refused' }, 'refused'],
  [{ status: 'truncated' }, 'output_limit'],
  [{ status: 'tool_output' }, 'invalid_output'],
] satisfies readonly (readonly [AdapterResult, string])[])(
  'rejects invalid complete/status output without repair',
  async (response, code) => {
    let attempts = 0;
    const adapter: GatewayAdapter = {
      provider: 'fake',
      async send() {
        attempts++;
        return response;
      },
    };
    const result = await createModelGateway({ adapter }).invoke(request());
    expect(result).toMatchObject({
      ok: false,
      code,
      retryable: false,
      metadata: { attempts: 1, outcome: code },
    });
    expect(attempts).toBe(1);
    expect(JSON.stringify(result)).not.toContain('PRIVATE_CANARY');
  },
);
it('does not expose unexpected adapter errors or turn them into candidate assessments', async () => {
  const adapter: GatewayAdapter = {
    provider: 'fake',
    async send() {
      throw new Error('PROVIDER_BODY_SECRET_CANARY');
    },
  };
  const result = await createModelGateway({ adapter }).invoke(request());
  expect(result).toMatchObject({
    ok: false,
    code: 'configuration_error',
    metadata: { attempts: 1 },
  });
  expect(JSON.stringify(result)).not.toContain('CANARY');
});
it('honors an already cancelled caller without dispatch', async () => {
  const abort = new AbortController();
  abort.abort('SECRET_CANARY');
  const result = await createModelGateway({
    adapter: createFakeAdapter(),
  }).invoke({ ...request(), signal: abort.signal });
  expect(result).toMatchObject({
    ok: false,
    code: 'cancelled',
    retryable: false,
    metadata: { attempts: 0 },
  });
  expect(JSON.stringify(result)).not.toContain('CANARY');
});
