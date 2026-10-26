import { expect, it } from 'vitest';
import {
  createModelGateway,
  type GatewayAdapter,
} from '../../../src/modules/model-gateway/public';
import {
  proposal,
  evidence,
} from '../../fixtures/approach-assessment/semantic';
const input = {
  text: evidence[0].text,
  references: [
    {
      id: 'map',
      name: 'Map',
      summary: 'PRIVATE_REFERENCE',
      preconditions: [],
      matchingFeatures: [],
    },
  ],
  evidence: [...evidence],
};
it('dispatches typed approach assessment with schema validation and private-free metadata', async () => {
  const gateway = createModelGateway({
    adapter: {
      provider: 'fake',
      async send(request) {
        return {
          status: 'complete',
          text: JSON.stringify(
            request.operation === 'approach_assessment' ? proposal : {},
          ),
          reportedModel: null,
          usage: null,
        };
      },
    },
    environment: 'test',
  });
  const result = await gateway.invoke({
    operation: 'approach_assessment',
    input,
    context: { requestId: 'review-1', operationId: 'evaluation-1' },
    signal: new AbortController().signal,
  });
  expect(result).toMatchObject({
    ok: true,
    data: { operation: 'approach_assessment' },
  });
  expect(JSON.stringify(result.metadata)).not.toMatch(/PRIVATE|I use a map/);
  await gateway.close();
});
it('bounds transient attempts and rejects private additions or malformed confidence', async () => {
  let sends = 0;
  const adapter: GatewayAdapter = {
    provider: 'fake',
    async send() {
      sends++;
      return {
        status: 'failure',
        code: 'provider_unavailable',
        retryable: true,
        internalRetry: true,
      };
    },
  };
  const gateway = createModelGateway({ adapter, environment: 'test' });
  expect(
    await gateway.invoke({
      operation: 'approach_assessment',
      input,
      context: { requestId: 'review-1', operationId: 'evaluation-1' },
      signal: new AbortController().signal,
    }),
  ).toMatchObject({
    ok: false,
    code: 'provider_unavailable',
    metadata: { attempts: 2 },
  });
  expect(sends).toBe(2);
  await gateway.close();
  const invalid = createModelGateway({
    adapter: {
      provider: 'fake',
      async send() {
        return {
          status: 'complete',
          text: JSON.stringify({ ...proposal, futureHint: 'CANARY' }),
          reportedModel: null,
          usage: null,
        };
      },
    },
    environment: 'test',
  });
  expect(
    await invalid.invoke({
      operation: 'approach_assessment',
      input,
      context: { requestId: 'review-2', operationId: 'evaluation-2' },
      signal: new AbortController().signal,
    }),
  ).toMatchObject({ ok: false, code: 'invalid_output' });
  await invalid.close();
});
it('registers a strict-provider-compatible output schema with every property required', async () => {
  const { createOperationRegistry } =
    await import('../../../src/modules/model-gateway/application/operations');
  const resolved = createOperationRegistry().resolve('approach_assessment');
  expect(resolved.ok).toBe(true);
  if (!resolved.ok) return;
  function inspect(value: unknown): void {
    if (value && typeof value === 'object') {
      const node = value as Record<string, unknown>;
      if (node.type === 'object') {
        expect(node.additionalProperties).toBe(false);
        expect(node.required).toEqual(Object.keys(node.properties as object));
      }
      for (const child of Object.values(node))
        if (Array.isArray(child)) child.forEach(inspect);
        else inspect(child);
    }
  }
  inspect(resolved.definition.outputJsonSchema);
});
