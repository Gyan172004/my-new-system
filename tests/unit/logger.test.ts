import { Writable } from 'node:stream';
import { expect, it } from 'vitest';
import { createSafeLogger } from '../../src/server/logger';
import { parseRuntimeConfig } from '../../src/server/config';
const config = parseRuntimeConfig({
  APP_ENV: 'test',
  DATABASE_URL: 'postgresql://unreachable.invalid/app',
});
it('projects only bounded safe telemetry and never serializes planted payloads or exceptions', () => {
  let output = '';
  const sink = new Writable({
    write(chunk, _encoding, next) {
      output += chunk.toString();
      next();
    },
  });
  const logger = createSafeLogger(config, sink);
  logger.write('http_completed', {
    requestId: 'a22f78a8-5a92-4c65-bf10-cec243c36f5c',
    method: 'GET',
    route: '/api/v1/health/live',
    status: 200,
    elapsedMs: 12,
    authorization: 'CANARY_TOKEN',
    body: 'CANARY_BODY',
    err: new Error('CANARY_EXCEPTION'),
    query: 'CANARY_QUERY',
  });
  logger.write('CANARY_EVENT', {
    method: 'CANARY_METHOD',
    route: '/CANARY_ROUTE',
    requestId: 'CANARY_ID',
    code: 'CANARY_CODE',
    elapsedMs: Infinity,
    status: -1,
  });
  expect(output).not.toBe('');
  const rows = output
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));
  expect(rows[0]).toMatchObject({
    event: 'http_completed',
    service: 'foundation',
    environment: 'test',
    method: 'GET',
    route: '/api/v1/health/live',
    status: 200,
    elapsedMs: 12,
  });
  expect(Object.keys(rows[0]).sort()).toEqual(
    [
      'level',
      'time',
      'event',
      'service',
      'environment',
      'requestId',
      'method',
      'route',
      'status',
      'elapsedMs',
    ].sort(),
  );
  expect(rows[1]).toMatchObject({
    event: 'application_error',
    method: 'OTHER',
    route: 'unmatched',
  });
  expect(output).not.toContain('CANARY');
});
it('honors silent logging without writing to the sink', () => {
  let output = '';
  const sink = new Writable({
    write(chunk, _encoding, next) {
      output += chunk.toString();
      next();
    },
  });
  createSafeLogger({ ...config, logLevel: 'silent' }, sink).write(
    'database_error',
    { code: 'database_unavailable' },
  );
  expect(output).toBe('');
});
