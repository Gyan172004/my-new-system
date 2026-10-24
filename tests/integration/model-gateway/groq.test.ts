import { expect, it } from 'vitest';
import {
  fixture,
  request,
} from '../../fixtures/model-gateway/provider-harness';
it('Groq connection loss is retryable once per adapter dispatch without hidden retries', async () => {
  let dispatches = 0;
  const { adapter } = await fixture(
    'groq',
    undefined,
    200,
    'application/json',
    (q, r) => {
      dispatches++;
      r.destroy();
    },
  );
  expect(
    await adapter.send(request('groq'), new AbortController().signal),
  ).toMatchObject({
    code: 'provider_unavailable',
    retryable: true,
    internalRetry: true,
  });
  expect(dispatches).toBe(1);
});
it('Groq aborts an incomplete streamed fixture without returning late JSON', async () => {
  const controller = new AbortController();
  const { adapter } = await fixture(
    'groq',
    undefined,
    200,
    'application/json',
    (_q, r) => {
      r.writeHead(200, { 'content-type': 'application/json' });
      r.write('{');
      controller.abort();
    },
  );
  expect(await adapter.send(request('groq'), controller.signal)).toMatchObject({
    code: 'cancelled',
    retryable: false,
  });
});
