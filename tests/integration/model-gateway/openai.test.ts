import { expect, it } from 'vitest';
import { createModelGateway } from '../../../src/modules/model-gateway/public';
import {
  fixture,
  request,
} from '../../fixtures/model-gateway/provider-harness';
it('OpenAI connection loss is retryable without hidden adapter retries', async () => {
  let dispatches = 0;
  const { adapter } = await fixture(
    'openai',
    undefined,
    200,
    'application/json',
    (_q, r) => {
      dispatches++;
      r.destroy();
    },
  );
  expect(
    await adapter.send(request('openai'), new AbortController().signal),
  ).toMatchObject({
    code: 'provider_unavailable',
    retryable: true,
    internalRetry: true,
  });
  expect(dispatches).toBe(1);
});
it('OpenAI abort discards a streamed incomplete response', async () => {
  const controller = new AbortController();
  const { adapter } = await fixture(
    'openai',
    undefined,
    200,
    'application/json',
    (_q, r) => {
      r.writeHead(200, { 'content-type': 'application/json' });
      r.write('{');
      controller.abort();
    },
  );
  expect(
    await adapter.send(request('openai'), controller.signal),
  ).toMatchObject({ code: 'cancelled', retryable: false });
});
it('OpenAI production cannot dispatch with an unverified input-token reservation bound', async () => {
  const { adapter, received } = await fixture('openai');
  const engine = createModelGateway({
    adapter,
    environment: 'production',
    rateCard: {
      version: 'fixture-v1',
      reviewed: true,
      model: 'gpt-6.1-sol',
      inputUsdPerMillion: 1,
      outputUsdPerMillion: 1,
    },
  });
  expect(
    await engine.invoke({
      operation: 'gateway_probe',
      input: { text: 'Synthetic fixture' },
      context: { requestId: 'fixture', operationId: 'fixture' },
      signal: new AbortController().signal,
    }),
  ).toMatchObject({
    ok: false,
    code: 'budget_exceeded',
    metadata: { attempts: 0 },
  });
  expect(received).toHaveLength(0);
  await engine.close();
});
