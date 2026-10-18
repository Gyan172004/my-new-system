import {
  createServer,
  request as send,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http';
import { Writable } from 'node:stream';
import { expect, it } from 'vitest';
import { createHttpHandler } from '../../src/server/http';
import { createRequestScope } from '../../src/server/request-context';
import { createSafeLogger } from '../../src/server/logger';
import { parseRuntimeConfig } from '../../src/server/config';
const config = parseRuntimeConfig({
  APP_ENV: 'test',
  DATABASE_URL: 'postgresql://unreachable.invalid/app',
});
async function fixture(
  handle: (req: IncomingMessage, res: ServerResponse) => Promise<void>,
  work: (port: number, output: () => string) => Promise<void>,
  draining = false,
) {
  let output = '';
  const scope = createRequestScope();
  const logger = createSafeLogger(
    config,
    new Writable({
      write(chunk, _encoding, next) {
        output += chunk.toString();
        next();
      },
    }),
  );
  const server = createServer(
    createHttpHandler(handle, { scope, logger, isDraining: () => draining }),
  );
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('test_address');
  try {
    await work(address.port, () => output);
    expect(scope.current()).toBeUndefined();
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}
it('logs one completion per parallel request with server IDs and bounded unmatched routes', async () => {
  await fixture(
    async (_req, res) => {
      await new Promise((resolve) => setTimeout(resolve, 2));
      res.end('ok');
    },
    async (port, output) => {
      await Promise.all(
        [1, 2, 3].map((i) =>
          fetch(
            `http://127.0.0.1:${port}/CANARY_PATH_${i}?token=CANARY_QUERY`,
            {
              method: 'POST',
              headers: {
                authorization: 'CANARY_TOKEN',
                'x-request-id': 'CANARY_ID',
                cookie: 'CANARY_COOKIE',
              },
              body: 'CANARY_BODY',
            },
          ).then((r) => r.text()),
        ),
      );
      expect(output()).not.toBe('');
      const rows = output()
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line));
      expect(rows).toHaveLength(3);
      expect(new Set(rows.map((r) => r.requestId)).size).toBe(3);
      for (const row of rows)
        expect(row).toMatchObject({
          event: 'http_completed',
          route: 'unmatched',
          method: 'POST',
          status: 200,
        });
      expect(output()).not.toContain('CANARY');
    },
  );
});
it('sanitizes unexpected errors into a canonical API error and safe failure telemetry', async () => {
  await fixture(
    async () => {
      throw new Error('CANARY_DEPENDENCY');
    },
    async (port, output) => {
      const response = await fetch(`http://127.0.0.1:${port}/CANARY_PATH`);
      expect(response.status).toBe(500);
      const body = await response.json();
      expect(body).toMatchObject({
        code: 'internal_error',
        message: 'Request failed',
      });
      expect(body.requestId).toMatch(/^[0-9a-f-]{36}$/);
      expect(JSON.stringify(body) + output()).not.toContain('CANARY');
      expect(
        output()
          .trim()
          .split('\n')
          .map((line) => JSON.parse(line).event),
      ).toEqual(['http_failed', 'http_completed']);
    },
  );
});
it('returns safe HealthStatus on health-handler errors and while draining', async () => {
  for (const draining of [false, true])
    await fixture(
      async () => {
        throw new Error('CANARY_HEALTH');
      },
      async (port, output) => {
        const response = await fetch(
          `http://127.0.0.1:${port}/api/v1/health/ready`,
        );
        expect(response.status).toBe(503);
        expect(response.headers.get('cache-control')).toBe('no-store');
        expect(await response.json()).toMatchObject({
          status: 'unavailable',
          checks: { application: 'unavailable' },
        });
        expect(output()).not.toContain('CANARY');
      },
      draining,
    );
});
it('records a cancelled response once without exposing its URL or retaining async context', async () => {
  await fixture(
    async (_req, res) => {
      await new Promise((resolve) => setTimeout(resolve, 50));
      if (!res.destroyed) res.end('late');
    },
    async (port, output) => {
      await new Promise<void>((resolve) => {
        const req = send(
          { host: '127.0.0.1', port, path: '/CANARY_CANCEL' },
          () => {},
        );
        req.on('error', () => resolve());
        req.end();
        setTimeout(() => req.destroy(), 15);
      });
      await new Promise((resolve) => setTimeout(resolve, 70));
      expect(output()).not.toBe('');
      const rows = output()
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line));
      expect(rows).toHaveLength(1);
      expect(rows[0].status).toBe(499);
      expect(output()).not.toContain('CANARY');
    },
  );
});
