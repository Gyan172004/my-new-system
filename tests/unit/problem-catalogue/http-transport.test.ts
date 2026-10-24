import { expect, it } from 'vitest';
import { createServer } from 'node:http';
import { routeTemplate, createHttpHandler } from '../../../src/server/http';
import { createRequestScope } from '../../../src/server/request-context';
it('uses only bounded catalogue templates without raw path/query identifiers', () => {
  expect(routeTemplate('/api/v1/problems?cursor=CANARY')).toBe(
    '/api/v1/problems',
  );
  expect(routeTemplate('/api/v1/problems/CANARY?secret=CANARY')).toBe(
    '/api/v1/problems/{problemId}',
  );
  expect(routeTemplate('/api/v1/problems/x/nested')).toBe('unmatched');
});
it('preserves health responses while catalogue drain/failures use ApiError', async () => {
  for (const draining of [true, false]) {
    const handler = createHttpHandler(
      async () => {
        throw Error('CANARY_DEPENDENCY');
      },
      {
        scope: createRequestScope(),
        logger: { write() {}, async close() {}, destroy() {} },
        isDraining: () => draining,
      },
    );
    const server = createServer(handler);
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const address = server.address();
    if (!address || typeof address === 'string') throw Error('missing_address');
    try {
      for (const path of [
        '/api/v1/health/live',
        '/api/v1/problems',
        '/api/v1/problems/private',
      ]) {
        const response = await fetch(`http://127.0.0.1:${address.port}${path}`);
        const body = await response.json();
        if (path.includes('health')) {
          expect(response.status).toBe(503);
          expect(body.status).toBe('unavailable');
        } else {
          expect(response.status).toBe(draining ? 503 : 500);
          expect(body).toHaveProperty('requestId');
          expect(body).toHaveProperty('code');
          expect(body).not.toHaveProperty('checks');
        }
        expect(JSON.stringify(body)).not.toContain('CANARY');
      }
    } finally {
      await new Promise<void>((r, j) => server.close((e) => (e ? j(e) : r())));
    }
  }
});

it('delegates malformed encoded catalogue paths through the same Next handler graph', async () => {
  let forwarded: string | undefined;
  let authorization: string | undefined;
  const server = createServer(
    createHttpHandler(
      async (request, response) => {
        forwarded = request.url;
        authorization = request.headers.authorization;
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end('{}');
      },
      {
        scope: createRequestScope(),
        logger: { write() {}, async close() {}, destroy() {} },
        isDraining: () => false,
      },
    ),
  );
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw Error('missing_address');
  try {
    const response = await fetch(
      `http://127.0.0.1:${address.port}/api/v1/problems/%FF?private=CANARY`,
      { headers: { authorization: 'Bearer synthetic' } },
    );
    expect(response.status).toBe(200);
    expect(forwarded).toBe('/api/v1/problems/%00');
    expect(authorization).toBe('Bearer synthetic');
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
