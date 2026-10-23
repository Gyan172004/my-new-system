import { createServer, type Server, type RequestListener } from 'node:http';
import { afterEach, expect, it } from 'vitest';
import { createProviderTransport } from '../../../src/modules/model-gateway/adapters/transport';
const servers: Server[] = [];
afterEach(async () => {
  for (const server of servers.splice(0)) {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
async function fixture(handler: RequestListener) {
  const server = createServer(handler);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw Error('address');
  return `http://127.0.0.1:${address.port}`;
}
const limits = { requestBytes: 16384, responseBytes: 131072 };
async function transport(handler: RequestListener) {
  const origin = await fixture(handler);
  const seen: string[] = [];
  const client = createProviderTransport('groq', async (url, init) => {
    seen.push(String(url));
    return fetch(origin, { ...init });
  });
  return { client, seen };
}
const send = (
  client: ReturnType<typeof createProviderTransport>,
  body = '{}',
  signal = new AbortController().signal,
) => client.send({ body, apiKey: 'DUMMY_CANARY', signal, limits });
it('uses the fixed provider URL and bounded complete JSON without trusting content length', async () => {
  const { client, seen } = await transport((_q, r) => {
    r.writeHead(200, { 'content-type': 'application/json' });
    r.write('{"ok":');
    r.end('true}');
  });
  expect(await send(client)).toMatchObject({
    ok: true,
    status: 200,
    body: '{"ok":true}',
  });
  expect(seen).toEqual(['https://api.groq.com/openai/v1/chat/completions']);
});
it('rejects serialized request beyond 16 KiB without HTTP dispatch', async () => {
  let requests = 0;
  const { client } = await transport((_q, r) => {
    requests++;
    r.end('{}');
  });
  expect(await send(client, '€'.repeat(5462))).toMatchObject({
    ok: false,
    code: 'invalid_request',
  });
  expect(requests).toBe(0);
});
it('accepts the exact byte caps', async () => {
  let bytes = 0;
  const { client } = await transport((q, r) => {
    q.on('data', (chunk: Buffer) => {
      bytes += chunk.length;
    });
    q.on('end', () => {
      r.writeHead(200, { 'content-type': 'application/json' });
      r.end(' '.repeat(131072));
    });
  });
  expect(await send(client, ' '.repeat(16384))).toMatchObject({ ok: true });
  expect(bytes).toBe(16384);
});
it.each([false, true])(
  'rejects oversized streamed response with content-length declared=%s',
  async (declared) => {
    const { client } = await transport((_q, r) => {
      r.writeHead(200, {
        'content-type': 'application/json',
        ...(declared ? { 'content-length': '131073' } : {}),
      });
      r.end('x'.repeat(131073));
    });
    expect(await send(client)).toMatchObject({
      ok: false,
      code: 'output_limit',
    });
  },
);
it('denies redirects without forwarding dummy credentials', async () => {
  let requests = 0;
  const { client } = await transport((_q, r) => {
    requests++;
    r.writeHead(302, { location: 'https://private.invalid' });
    r.end();
  });
  expect(await send(client)).toMatchObject({
    ok: false,
    code: 'configuration_error',
  });
  expect(requests).toBe(1);
});
it('aborts a hung partial response, closes its stream and ignores late bytes', async () => {
  let closed!: () => void;
  const closure = new Promise<void>((r) => {
    closed = r;
  });
  const controller = new AbortController();
  const { client } = await transport((_q, r) => {
    r.on('close', closed);
    r.writeHead(200, { 'content-type': 'application/json' });
    r.write('{');
    controller.abort();
  });
  expect(await send(client, '{}', controller.signal)).toMatchObject({
    ok: false,
    code: 'cancelled',
  });
  await closure;
});
it('rejects false content length truncation as an incomplete body', async () => {
  const { client } = await transport((_q, r) => {
    r.writeHead(200, {
      'content-type': 'application/json',
      'content-length': '100',
    });
    r.write('{}');
    r.destroy();
  });
  expect(await send(client)).toMatchObject({
    ok: false,
    code: 'provider_unavailable',
  });
});
it('close cancels active requests and future dispatch with no hidden retry', async () => {
  let requests = 0;
  const { client } = await transport((_q, r) => {
    requests++;
    r.writeHead(200, { 'content-type': 'application/json' });
    r.write('{');
    void client.close();
  });
  expect(await send(client)).toMatchObject({ ok: false, code: 'cancelled' });
  expect(await send(client)).toMatchObject({ ok: false, code: 'cancelled' });
  expect(requests).toBe(1);
});
it('drops response readers on byte-limit failure even for a never-ending stream', async () => {
  let closed!: () => void;
  const closure = new Promise<void>((r) => {
    closed = r;
  });
  const { client } = await transport((_q, r) => {
    r.on('close', closed);
    r.writeHead(200, { 'content-type': 'application/json' });
    r.write('x'.repeat(131073));
  });
  expect(await send(client)).toMatchObject({ code: 'output_limit' });
  await closure;
});
it('cancels a response body arriving after an uncooperative fetch has already been aborted', async () => {
  let resolveFetch!: (response: Response) => void;
  let cancelled = 0;
  const controller = new AbortController();
  const client = createProviderTransport(
    'openai',
    async () =>
      new Promise<Response>((resolve) => {
        resolveFetch = resolve;
      }),
  );
  const result = send(client, '{}', controller.signal);
  // Allow the real transport to dispatch its injected IO dependency before aborting it.
  await new Promise<void>((resolve) => setImmediate(resolve));
  controller.abort();
  expect(await result).toMatchObject({ code: 'cancelled' });
  resolveFetch(
    new Response(
      new ReadableStream({
        cancel() {
          cancelled++;
          throw Error('SECRET_CANARY');
        },
      }),
    ),
  );
  await new Promise<void>((resolve) => setImmediate(resolve));
  expect(cancelled).toBe(1);
});
it('cancels a response when caller abort wins between fetch arrival and reader ownership', async () => {
  let cancelled = 0;
  const controller = new AbortController();
  const client = createProviderTransport('openai', () => {
    queueMicrotask(() => queueMicrotask(() => controller.abort()));
    return Promise.resolve(
      new Response(
        new ReadableStream({
          cancel() {
            cancelled++;
          },
        }),
      ),
    );
  });
  expect(await send(client, '{}', controller.signal)).toMatchObject({
    code: 'cancelled',
  });
  await new Promise<void>((resolve) => setImmediate(resolve));
  expect(cancelled).toBe(1);
});
