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
const routes = new Set([
  '/api/v1/health/live',
  '/api/v1/health/ready',
  '/api/v1/problems',
  '/api/v1/problems/{problemId}',
]);
const events = new Set([
  'model_call_completed',
  'http_completed',
  'identity_denied',
  'catalogue_read',
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
  'invalid_request',
  'not_found',
  'catalogue_unavailable',
  'ok',
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
      if (event === 'model_call_completed') {
        const label = (
          key: string,
          allowed: readonly string[],
          fallback: string | null = null,
        ) => {
          safe[key] =
            typeof fields[key] === 'string' &&
            allowed.includes(fields[key] as string)
              ? fields[key]
              : fallback;
        };
        label(
          'operation',
          [
            'gateway_probe',
            'interview_turn',
            'approach_assessment',
            'hint_support',
            'feedback',
            'intent_classification',
            'stage_classification',
            'transcription',
            'speech',
          ],
          'unknown',
        );
        label('provider', ['fake', 'groq', 'openai']);
        for (const key of ['configuredModel', 'reportedModel'])
          label(key, [
            'fake-probe-v1',
            'gpt-6.1-sol',
            'gpt-6-luna',
            'openai/gpt-oss-120b',
            'gpt-transcribe',
            'gpt-4o-mini-tts',
          ]);
        for (const key of [
          'promptVersion',
          'inputSchemaVersion',
          'outputSchemaVersion',
        ])
          label(key, ['1']);
        label('evaluationVersion', ['synthetic-probe-v1', 'interview-turn-v1']);
        // operationId's known legitimate shapes only — a generic match on
        // the gateway's full `reference` schema shape
        // (^[A-Za-z0-9][A-Za-z0-9_.:-]*$) is too permissive here: it would
        // also match an arbitrary uppercase/underscore string like
        // 'SECRET_CANARY', defeating the "no secret ever leaks" guarantee
        // this logger otherwise provides. Recognize the fixed operator
        // fixture plus the real interview_turn composite format
        // (tech_design.md §2: "interview_turn:" + turnId + ":" + attempt,
        // turnId itself reference-shaped) explicitly, so a legitimate
        // caller-constructed ID survives while anything else — including a
        // secret-shaped string that happens to pass a looser shape check —
        // still nulls.
        safe.operationId =
          typeof fields.operationId === 'string' &&
          (fields.operationId === 'gateway-probe-v1' ||
            /^interview_turn:[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}:[1-9][0-9]*$/.test(
              fields.operationId,
            ))
            ? fields.operationId
            : null;
        for (const key of ['callId', 'sessionId'])
          if (
            typeof fields[key] === 'string' &&
            /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
              fields[key] as string,
            )
          )
            safe[key] = fields[key];
        label(
          'outcome',
          [
            'success',
            'invalid_request',
            'operation_disabled',
            'unsupported_operation',
            'configuration_error',
            'provider_auth_failed',
            'quota_exhausted',
            'provider_rejected',
            'saturated',
            'budget_exceeded',
            'rate_limited',
            'provider_unavailable',
            'timeout',
            'cancelled',
            'invalid_output',
            'refused',
            'output_limit',
          ],
          'configuration_error',
        );
        for (const key of ['usageCompleteness', 'costCompleteness'])
          label(key, ['complete', 'partial', 'unknown'], 'unknown');
        safe.actualCharge = 'unknown';
        for (const key of ['attempts', 'unknownAttempts', 'partialAttempts'])
          if (
            typeof fields[key] === 'number' &&
            Number.isInteger(fields[key]) &&
            fields[key] >= 0 &&
            fields[key] <= 2
          )
            safe[key] = fields[key];
        for (const key of [
          'inputTokens',
          'outputTokens',
          'totalTokens',
          'reasoningTokens',
          'cachedInputTokens',
          'expectedSessionVersion',
        ])
          if (
            typeof fields[key] === 'number' &&
            Number.isSafeInteger(fields[key]) &&
            fields[key] >= 0
          )
            safe[key] = fields[key];
        for (const key of ['estimatedCostUsd', 'reservedCostUsd'])
          if (
            typeof fields[key] === 'number' &&
            Number.isFinite(fields[key]) &&
            fields[key] >= 0
          )
            safe[key] = fields[key];
        if (
          typeof fields.durationMs === 'number' &&
          Number.isFinite(fields.durationMs)
        )
          safe.durationMs = Math.min(86400000, Math.max(0, fields.durationMs));
      }
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
