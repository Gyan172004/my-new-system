import { createServer, get } from 'node:http';
import { expect, it } from 'vitest';
import { Application, nodeAdapter } from '../../src/server/bootstrap';
import { createRuntime } from '../../src/server/runtime';

it('finishes an admitted real HTTP response before closing its Next adapter', async () => {
  const reservation = createServer();
  await new Promise<void>((resolve) =>
    reservation.listen(0, '127.0.0.1', resolve),
  );
  const address = reservation.address();
  if (!address || typeof address === 'string')
    throw new Error('port_unavailable');
  const port = address.port;
  await new Promise<void>((resolve) => reservation.close(() => resolve()));
  let release!: () => void;
  const waiting = new Promise<void>((resolve) => {
    release = resolve;
  });
  let accepted!: () => void;
  const admitted = new Promise<void>((resolve) => {
    accepted = resolve;
  });
  let nextClosed = false;
  const fakeNext = {
    prepare: async () => {},
    close: async () => {
      nextClosed = true;
    },
    getRequestHandler:
      () =>
      async (
        _request: import('node:http').IncomingMessage,
        response: import('node:http').ServerResponse,
      ) => {
        accepted();
        await waiting;
        response.end('admitted_work_complete');
      },
  };
  const app = new Application(
    {
      APP_ENV: 'test',
      DATABASE_URL: 'postgresql://localhost/foundation',
      PORT: String(port),
      SHUTDOWN_TIMEOUT_MS: '1000',
    },
    {
      createAdapter: (config) =>
        nodeAdapter(config, async () => () => fakeNext),
      installRuntime: createRuntime,
    },
  );
  await app.start();
  const response = new Promise<string>((resolve, reject) => {
    const request = get(
      `http://127.0.0.1:${port}/owned-test-request`,
      { agent: false },
      (result) => {
        let body = '';
        result.setEncoding('utf8');
        result.on('data', (chunk: string) => {
          body += chunk;
        });
        result.on('end', () => resolve(body));
      },
    );
    request.on('error', reject);
  });
  try {
    await admitted;
    let stopped = false;
    const stopping = app.stop().then(() => {
      stopped = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(stopped).toBe(false);
    expect(nextClosed).toBe(false);
    release();
    expect(await response).toBe('admitted_work_complete');
    await stopping;
    expect(nextClosed).toBe(true);
    expect(app.state).toBe('STOPPED');
  } finally {
    release();
    await app.stop().catch(() => {});
  }
});
