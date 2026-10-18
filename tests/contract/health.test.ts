import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { expect, it } from 'vitest';
import { GET as live } from '../../src/app/api/v1/health/live/route';
import {
  GET as ready,
  dynamic,
  runtime as routeRuntime,
} from '../../src/app/api/v1/health/ready/route';
import { installRuntime } from '../../src/server/runtime';
import { parseRuntimeConfig } from '../../src/server/config';
// Canonical HealthStatus: required [status,timestamp]; status enum
// [ok,degraded,unavailable], timestamp format date-time; optional checks values
// enum [ok,degraded,unavailable,skipped]. Validate the root contract, not a copy.
const contract = parse(readFileSync('contracts/api/v1_openapi.yaml', 'utf8'));
const ajv = new Ajv2020({ allErrors: true });
addFormats(ajv);
const validate = ajv.compile(contract.components.schemas.HealthStatus);
const runtime = installRuntime(
  parseRuntimeConfig({
    APP_ENV: 'test',
    DATABASE_URL: 'postgresql://unreachable.invalid/app',
  }),
);
runtime.getOrCreate(Symbol.for('dsa-interview.foundation.database.v1'), () => ({
  observe: async () => ({ revisions: null }),
  close: async () => {},
  destroy() {},
}));
runtime.state = 'VALIDATING';
runtime.state = 'INITIALIZING';
runtime.state = 'SERVING';
it('serves canonical unauthenticated versioned health with no cookies and no-store', async () => {
  for (const [path, handler] of [
    ['/health/live', live],
    ['/health/ready', ready],
  ] as const) {
    expect(contract.servers[0].url).toBe('/api/v1');
    expect(contract.paths[path].get.security).toEqual([]);
    const response = await handler();
    expect([200, 503]).toContain(response.status);
    expect(
      contract.paths[path].get.responses[String(response.status)],
    ).toBeDefined();
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('set-cookie')).toBeNull();
    const body = await response.json();
    expect(validate(body), JSON.stringify(validate.errors)).toBe(true);
    expect(['ok', 'unavailable']).toContain(body.status);
  }
  expect(dynamic).toBe('force-dynamic');
  expect(routeRuntime).toBe('nodejs');
  await runtime.closeResources();
});
it('rejects malformed statuses/timestamps/checks and missing required fields with the actual schema', () => {
  for (const bad of [
    { status: 'ok' },
    { timestamp: new Date().toISOString() },
    { status: 'success', timestamp: new Date().toISOString() },
    { status: 'ok', timestamp: 'yesterday' },
    {
      status: 'ok',
      timestamp: new Date().toISOString(),
      checks: { database: 'secret' },
    },
  ])
    expect(validate(bad)).toBe(false);
});
