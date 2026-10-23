import { Writable } from 'node:stream';
import { expect, it } from 'vitest';
import { createSafeLogger } from '../../../src/server/logger';
import { parseRuntimeConfig } from '../../../src/server/config';
it('allowlists a bounded model-call summary and strips content, secrets and unknown provider labels', () => {
  let output = '';
  const logger = createSafeLogger(
    parseRuntimeConfig({
      APP_ENV: 'test',
      DATABASE_URL: 'postgresql://unreachable.invalid/app',
    }),
    new Writable({
      write(chunk, _encoding, callback) {
        output += String(chunk);
        callback();
      },
    }),
  );
  logger.write('model_call_completed', {
    requestId: 'b648277e-ad0b-48cf-996d-128c2475f0ce',
    callId: 'b648277e-ad0b-48cf-996d-128c2475f0ce',
    operation: 'gateway_probe',
    provider: 'fake',
    configuredModel: 'fake-probe-v1',
    reportedModel: 'fake-probe-v1',
    promptVersion: '1',
    inputSchemaVersion: '1',
    outputSchemaVersion: '1',
    evaluationVersion: 'synthetic-probe-v1',
    operationId: 'synthetic-probe-v1',
    attempts: 2,
    durationMs: 123,
    outcome: 'timeout',
    inputTokens: 100,
    outputTokens: 20,
    reasoningTokens: 5,
    cachedInputTokens: 10,
    estimatedCostUsd: 0.001,
    actualCharge: 'unknown',
    body: 'SECRET_CANARY',
    authorization: 'KEY_CANARY',
    error: Error('SECRET_CANARY'),
  });
  const record = JSON.parse(output);
  expect(record).toMatchObject({
    event: 'model_call_completed',
    operation: 'gateway_probe',
    provider: 'fake',
    configuredModel: 'fake-probe-v1',
    outcome: 'timeout',
    attempts: 2,
    durationMs: 123,
    inputTokens: 100,
    outputTokens: 20,
    estimatedCostUsd: 0.001,
    actualCharge: 'unknown',
  });
  expect(output).not.toContain('CANARY');
  output = '';
  logger.write('model_call_completed', {
    operation: 'SECRET_CANARY',
    provider: 'SECRET_CANARY',
    configuredModel: 'SECRET_CANARY',
    promptVersion: 'SECRET_CANARY',
    operationId: 'SECRET_CANARY',
    attempts: Infinity,
    inputTokens: -1,
    estimatedCostUsd: NaN,
    outcome: 'SECRET_CANARY',
  });
  expect(JSON.parse(output)).toMatchObject({
    operation: 'unknown',
    provider: null,
    configuredModel: null,
    promptVersion: null,
    outcome: 'configuration_error',
  });
  expect(output).not.toContain('CANARY');
});
it('allowlists interview_turn evaluationVersion alongside the probe default, and nulls anything else', () => {
  let output = '';
  const logger = createSafeLogger(
    parseRuntimeConfig({
      APP_ENV: 'test',
      DATABASE_URL: 'postgresql://unreachable.invalid/app',
    }),
    new Writable({
      write(chunk, _encoding, callback) {
        output += String(chunk);
        callback();
      },
    }),
  );
  logger.write('model_call_completed', {
    operation: 'interview_turn',
    evaluationVersion: 'interview-turn-v1',
  });
  expect(JSON.parse(output)).toMatchObject({
    evaluationVersion: 'interview-turn-v1',
  });

  output = '';
  logger.write('model_call_completed', {
    operation: 'interview_turn',
    evaluationVersion: 'some-unlisted-version',
  });
  expect(JSON.parse(output)).toMatchObject({
    evaluationVersion: null,
  });
});
