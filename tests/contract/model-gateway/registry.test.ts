import { describe, expect, it } from 'vitest';
import Ajv2020 from 'ajv/dist/2020.js';
import {
  canonicalOperations,
  createOperationRegistry,
} from '../../../src/modules/model-gateway/application/operations';
import { probeOutputSchema } from '../../../src/modules/model-gateway/application/validation';
import { outputCases } from '../../fixtures/model-gateway/probe';

it.each(outputCases)(
  'provider JSON Schema and runtime agree on exact probe output: $value',
  ({ value, valid }) => {
    const definition = canonicalOperations[0]!;
    const jsonValidate = new Ajv2020({ strict: false }).compile(
      definition.outputJsonSchema!,
    );
    expect(Boolean(jsonValidate(value))).toBe(valid);
    expect(probeOutputSchema.safeParse(value).success).toBe(valid);
  },
);

describe('IO-01: interview_turn registration (tech_design.md §2)', () => {
  // Expected limits/model-mapping pinned by tech_design.md §2: reuses gateway_probe's own
  // defaults verbatim (owner's 2026-10-24 decision) — 15s total / 6s per attempt / 1,024
  // completion tokens / 16,384 request bytes / 131,072 response bytes / 2 attempts / 2 concurrent.
  const pinnedLimits = Object.freeze({
    requestBytes: 16_384,
    responseBytes: 131_072,
    completionTokens: 1_024,
    totalTimeoutMs: 15_000,
    attemptTimeoutMs: 6_000,
    maxAttempts: 2,
    maxConcurrent: 2,
    estimatedCostUsd: null,
  });
  const pinnedModels = Object.freeze({
    openai: 'gpt-6.1-sol',
    groq: 'openai/gpt-oss-120b',
  });

  it('resolves interview_turn from the real canonicalOperations registry with the pinned schema/limits/model mapping', () => {
    const registry = createOperationRegistry();
    const resolved = registry.resolve('interview_turn');
    expect(resolved).toMatchObject({
      ok: true,
      definition: { name: 'interview_turn' },
    });
    if (!resolved.ok) return;
    const { definition } = resolved;
    expect(definition.limits).toEqual(pinnedLimits);
    expect(definition.models).toEqual(pinnedModels);
    expect(definition.allowedContext).toEqual(['text']);
    expect(definition.capabilities).toEqual(['structured_text']);

    // Input schema: z.strictObject({ text: z.string().min(1).max(8_192) }) per tech_design.md §2.
    expect(definition.inputSchema.safeParse({ text: 'x' }).success).toBe(true);
    expect(
      definition.inputSchema.safeParse({ text: 'x'.repeat(8_192) }).success,
    ).toBe(true);
    expect(
      definition.inputSchema.safeParse({ text: 'x'.repeat(8_193) }).success,
    ).toBe(false);
    expect(definition.inputSchema.safeParse({ text: '' }).success).toBe(false);
    expect(definition.inputSchema.safeParse({}).success).toBe(false);
    expect(
      definition.inputSchema.safeParse({ text: 'x', extra: 'y' }).success,
    ).toBe(false);

    // Output schema per tech_design.md §2.
    expect(
      definition.outputSchema.safeParse({
        schemaVersion: 1,
        responseText: 'Tell me more about your approach.',
      }).success,
    ).toBe(true);
    expect(
      definition.outputSchema.safeParse({
        schemaVersion: 1,
        responseText: 'ok',
        suggestedTransitionSignal: 'ready_to_advance',
        matchedReferenceApproachId: 'approach-1',
      }).success,
    ).toBe(true);
    // Abstention: omitting matchedReferenceApproachId must be a normal, accepted outcome.
    expect(
      definition.outputSchema.safeParse({
        schemaVersion: 1,
        responseText: 'ok',
        suggestedTransitionSignal: 'none',
      }).success,
    ).toBe(true);
    expect(
      definition.outputSchema.safeParse({
        schemaVersion: 2,
        responseText: 'ok',
      }).success,
    ).toBe(false);
    expect(
      definition.outputSchema.safeParse({ schemaVersion: 1, responseText: '' })
        .success,
    ).toBe(false);
    expect(
      definition.outputSchema.safeParse({
        schemaVersion: 1,
        responseText: 'x'.repeat(4_001),
      }).success,
    ).toBe(false);
    expect(
      definition.outputSchema.safeParse({
        schemaVersion: 1,
        responseText: 'ok',
        suggestedTransitionSignal: 'maybe',
      }).success,
    ).toBe(false);
    expect(
      definition.outputSchema.safeParse({
        schemaVersion: 1,
        responseText: 'ok',
        matchedReferenceApproachId: '',
      }).success,
    ).toBe(false);
  });

  it('still rejects an incomplete interview_turn declaration (missing prompt) via definitionSchema.safeParse', () => {
    const probeLike = canonicalOperations[0]!;
    const incomplete: Record<string, unknown> = {
      ...probeLike,
      name: 'interview_turn',
    };
    delete incomplete.prompt;
    expect(
      createOperationRegistry([incomplete]).resolve('interview_turn'),
    ).toEqual({ ok: false, code: 'operation_disabled' });
  });

  it('still rejects an interview_turn declaration with a wrong-shaped limits object', () => {
    const probeLike = canonicalOperations[0]!;
    const wrongLimits = {
      ...probeLike,
      name: 'interview_turn',
      limits: { ...pinnedLimits, requestBytes: undefined },
    };
    expect(
      createOperationRegistry([wrongLimits]).resolve('interview_turn'),
    ).toEqual({ ok: false, code: 'operation_disabled' });
  });

  it('leaves stage_classification and intent_classification registered but disabled, unchanged', () => {
    const registry = createOperationRegistry();
    for (const name of ['stage_classification', 'intent_classification']) {
      expect(canonicalOperations.some((d) => d.name === name)).toBe(true);
      expect(registry.resolve(name)).toEqual({
        ok: false,
        code: 'operation_disabled',
      });
    }
  });
});
