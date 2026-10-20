import pino from 'pino';
import type { Writable } from 'node:stream';
import type { RuntimeConfig } from './config';
import { getRuntime, type RuntimeRegistry } from './runtime';
const methods = new Set([
  'GET',
  'HEAD',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'OPTIONS',
]);
const routes = new Set(['/api/v1/health/live', '/api/v1/health/ready']);
const events = new Set([
  'http_completed',
  'identity_denied',
  'http_failed',
  'database_error',
  'application_started',
  'application_error',
  'startup_failed',
  'shutdown_failed',
]);
const codes = new Set([
  'internal_error',
  'service_unavailable',
  'database_unavailable',
  'request_cancelled',
  'unauthorized',
  'forbidden',
  'rate_limited',
  'identity_unavailable',
]);
export function createSafeLogger(
  config: RuntimeConfig,
  sink: Writable = process.stdout,
) {
  const logger = pino(
    {
      level: config.logLevel,
      base: { service: 'foundation', environment: config.appEnv },
      timestamp: pino.stdTimeFunctions.isoTime,
      redact: {
        paths: [
          'req',
          'res',
          'body',
          'headers',
          'err',
          'error',
          'stack',
          'authorization',
          'cookie',
          'token',
          'password',
          'DATABASE_URL',
        ],
        remove: true,
      },
    },
    sink,
  );
  return {
    write(event: string, fields: Readonly<Record<string, unknown>> = {}) {
      const safe: Record<string, unknown> = {
        event: events.has(event) ? event : 'application_error',
      };
      if (
        typeof fields.requestId === 'string' &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
          fields.requestId,
        )
      )
        safe.requestId = fields.requestId;
      if ('method' in fields)
        safe.method =
          typeof fields.method === 'string' && methods.has(fields.method)
            ? fields.method
            : 'OTHER';
      if ('route' in fields)
        safe.route =
          typeof fields.route === 'string' && routes.has(fields.route)
            ? fields.route
            : 'unmatched';
      if (
        typeof fields.status === 'number' &&
        Number.isInteger(fields.status) &&
        fields.status >= 100 &&
        fields.status <= 599
      )
        safe.status = fields.status;
      if (
        typeof fields.elapsedMs === 'number' &&
        Number.isFinite(fields.elapsedMs)
      )
        safe.elapsedMs = Math.min(
          86400000,
          Math.max(0, Math.round(fields.elapsedMs * 1000) / 1000),
        );
      if (typeof fields.code === 'string' && codes.has(fields.code))
        safe.code = fields.code;
      if (event === 'http_failed' || event === 'application_error')
        logger.error(safe);
      else if (event === 'database_error') logger.warn(safe);
      else logger.info(safe);
    },
    async close() {},
    destroy() {},
  };
}
const loggerKey = Symbol.for('dsa-interview.foundation.logger.v1');
export function runtimeLogger(runtime: RuntimeRegistry = getRuntime()) {
  return runtime.getOrCreate(loggerKey, () => createSafeLogger(runtime.config));
}
