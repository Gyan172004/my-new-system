import { describe, expect, it } from 'vitest';
import {
  canonicalOperations,
  createOperationRegistry,
} from '../../../src/modules/model-gateway/application/operations';
import {
  probeInputSchema,
  requestContextSchema,
} from '../../../src/modules/model-gateway/application/validation';
import { probeContext } from '../../fixtures/model-gateway/probe';

describe('operation registration', () => {
  it('resolves only the complete text probe and keeps canonical business/audio mappings disabled', () => {
    const registry = createOperationRegistry();
    expect(registry.resolve('gateway_probe')).toMatchObject({ ok: true });
    for (const [name, model] of [
      ['interview_turn', 'gpt-6.1-sol'],
      ['approach_assessment', 'gpt-6.1-sol'],
      ['hint_support', 'gpt-6.1-sol'],
      ['feedback', 'gpt-6.1-sol'],
      ['intent_classification', 'gpt-6-luna'],
      ['stage_classification', 'gpt-6-luna'],
      ['transcription', 'gpt-transcribe'],
      ['speech', 'gpt-4o-mini-tts'],
    ] as const) {
      expect(
        canonicalOperations.find((d) => d.name === name)?.models.openai,
      ).toBe(model);
      expect(registry.resolve(name)).toEqual({
        ok: false,
        code: 'operation_disabled',
      });
    }
    for (const name of [
      'not_registered',
      '__proto__',
      'constructor',
      'gpt-6-astra',
    ]) {
      expect(registry.resolve(name)).toEqual({
        ok: false,
        code: 'unsupported_operation',
      });
    }
  });

  it.each([
    'inputSchema',
    'outputSchema',
    'outputJsonSchema',
    'inputSchemaVersion',
    'outputSchemaVersion',
    'prompt',
    'evaluationVersion',
    'allowedContext',
    'models',
    'limits',
    'capabilities',
  ])('disables incomplete probe registration missing %s', (field) => {
    const definition: Record<string, unknown> = { ...canonicalOperations[0] };
    delete definition[field];
    expect(
      createOperationRegistry([definition]).resolve('gateway_probe'),
    ).toEqual({
      ok: false,
      code: 'operation_disabled',
    });
  });

  it('does not let trusted mutable definitions change registered behavior after construction', () => {
    const original = canonicalOperations[0]!;
    const definition = {
      ...original,
      limits: { ...original.limits!, maxAttempts: 2 },
    };
    const registry = createOperationRegistry([definition]);
    definition.limits.maxAttempts = 9;
    expect(registry.resolve('gateway_probe')).toMatchObject({
      ok: true,
      definition: { limits: { maxAttempts: 2 } },
    });
  });
});

describe('probe input boundaries', () => {
  it.each(['x', 'x'.repeat(512), 'é'.repeat(256), '😀'.repeat(128)])(
    'accepts nonempty input within 512 UTF-8 bytes',
    (text) => {
      expect(probeInputSchema.safeParse({ text }).success).toBe(true);
    },
  );
  it.each([
    {},
    { text: '' },
    { text: 'x'.repeat(513) },
    { text: 'é'.repeat(257) },
    { text: '😀'.repeat(129) },
    { text: 'ok', hiddenTests: 'CANARY' },
    { text: 1 },
    null,
  ])('rejects invalid input without widening the allowlist', (input) => {
    expect(probeInputSchema.safeParse(input).success).toBe(false);
  });
  it.each([
    { ...probeContext, requestId: '' },
    { ...probeContext, requestId: 'bad\nlog' },
    { ...probeContext, operationId: '' },
    { ...probeContext, operationId: 'bad\nlog' },
    { ...probeContext, sessionId: 'not-a-uuid' },
    { ...probeContext, expectedSessionVersion: -1 },
    { ...probeContext, packVersion: '' },
    { ...probeContext, rubricVersion: '' },
    { ...probeContext, policyVersion: '' },
    { ...probeContext, hiddenTests: 'CANARY' },
  ])(
    'rejects invalid identity/version or prohibited context fields',
    (context) => {
      expect(requestContextSchema.safeParse(context).success).toBe(false);
    },
  );
  it('accepts pinned caller references without requiring a session for the operator probe', () => {
    expect(requestContextSchema.safeParse(probeContext).success).toBe(true);
    expect(
      requestContextSchema.safeParse({
        ...probeContext,
        sessionId: probeContext.requestId,
        expectedSessionVersion: 1,
        packVersion: 'pack-v1',
        rubricVersion: 'rubric-v1',
        policyVersion: 'policy-v1',
      }).success,
    ).toBe(true);
  });
});
