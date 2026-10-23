import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  canonicalOperations,
  createOperationRegistry,
} from '../../../src/modules/model-gateway/application/operations';
import {
  probeInputSchema,
  probeOutputSchema,
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

describe('generalized candidate selection (IO-00)', () => {
  const interviewTurnInputSchema = z.strictObject({
    turnText: z.string().min(1),
  });
  const interviewTurnOutputSchema = z.strictObject({
    turnId: z.string().min(1),
  });
  const probeLike = canonicalOperations[0]!;
  const interviewTurnDefinition = Object.freeze({
    name: 'interview_turn',
    enabled: true,
    inputSchema: interviewTurnInputSchema,
    outputSchema: interviewTurnOutputSchema,
    outputJsonSchema: Object.freeze(z.toJSONSchema(interviewTurnOutputSchema)),
    inputSchemaVersion: '1',
    outputSchemaVersion: '1',
    prompt: Object.freeze({
      id: 'interview-turn-test',
      version: '1',
      body: 'Synthetic interview turn test prompt.',
    }),
    evaluationVersion: 'synthetic-interview-turn-v1',
    allowedContext: Object.freeze(['text']),
    models: Object.freeze({
      openai: 'gpt-6.1-sol',
      groq: 'openai/gpt-oss-120b',
    }),
    capabilities: Object.freeze(['structured_text']),
    limits: Object.freeze({ ...(probeLike as { limits: object }).limits }),
  });

  it('resolves a second, fully-declared operation alongside gateway_probe, each with its own schema', () => {
    const registry = createOperationRegistry([
      probeLike,
      interviewTurnDefinition,
    ]);
    expect(registry.resolve('gateway_probe')).toMatchObject({
      ok: true,
      definition: { name: 'gateway_probe', outputSchema: probeOutputSchema },
    });
    const resolved = registry.resolve('interview_turn');
    expect(resolved).toMatchObject({
      ok: true,
      definition: { name: 'interview_turn' },
    });
    if (resolved.ok) {
      expect(resolved.definition.outputSchema).toBe(interviewTurnOutputSchema);
      expect(resolved.definition.outputSchema).not.toBe(probeOutputSchema);
      expect(resolved.definition.inputSchema).toBe(interviewTurnInputSchema);
    }
  });

  it('keeps a still-disabled, schema-less stub resolving to operation_disabled without throwing on a missing schema field', () => {
    const registry = createOperationRegistry(canonicalOperations);
    expect(() => registry.resolve('transcription')).not.toThrow();
    expect(registry.resolve('transcription')).toEqual({
      ok: false,
      code: 'operation_disabled',
    });
  });

  it('fails closed when two validated candidates share the same name, registering neither (no last-write-wins)', () => {
    const first = Object.freeze({
      ...interviewTurnDefinition,
      prompt: Object.freeze({
        id: 'interview-turn-test-a',
        version: '1',
        body: 'First conflicting interview turn definition.',
      }),
    });
    const second = Object.freeze({
      ...interviewTurnDefinition,
      prompt: Object.freeze({
        id: 'interview-turn-test-b',
        version: '1',
        body: 'Second conflicting interview turn definition.',
      }),
    });
    const registry = createOperationRegistry([first, second]);
    expect(registry.resolve('interview_turn')).toEqual({
      ok: false,
      code: 'operation_disabled',
    });
  });

  it('still registers legitimately distinct operations that each appear exactly once', () => {
    const registry = createOperationRegistry([
      probeLike,
      interviewTurnDefinition,
    ]);
    expect(registry.resolve('gateway_probe')).toMatchObject({ ok: true });
    expect(registry.resolve('interview_turn')).toMatchObject({ ok: true });
  });
});

describe('widened closed operation-name set (T190)', () => {
  it('still resolves the two deferred classification names to operation_disabled, unchanged in behavior', () => {
    const registry = createOperationRegistry();
    for (const name of ['stage_classification', 'intent_classification']) {
      expect(registry.resolve(name)).toEqual({
        ok: false,
        code: 'operation_disabled',
      });
    }
  });

  it('closes the definition name enum over exactly the four widened names, accepting each as a well-formed candidate', () => {
    const probeLike = canonicalOperations[0]!;
    for (const name of [
      'gateway_probe',
      'interview_turn',
      'stage_classification',
      'intent_classification',
    ]) {
      // A fully-formed candidate (otherwise identical to the valid probe definition) must be
      // accepted by definitionSchema's name enum regardless of which of the four names it carries —
      // this only exercises the enum's closed set, not canonicalOperations' enabled flag.
      const definition = { ...probeLike, name };
      expect(createOperationRegistry([definition]).resolve(name)).toMatchObject(
        { ok: true },
      );
    }
  });

  it('still rejects a name outside the widened four-name set as unsupported', () => {
    const probeLike = canonicalOperations[0]!;
    const rejected = { ...probeLike, name: 'not_a_real_operation' };
    expect(
      createOperationRegistry([rejected]).resolve('not_a_real_operation'),
    ).toEqual({ ok: false, code: 'unsupported_operation' });
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
