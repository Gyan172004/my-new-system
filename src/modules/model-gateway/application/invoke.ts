import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { canonicalOperations, createOperationRegistry } from './operations';
import {
  probeInputSchema,
  probeOutputSchema,
  requestContextSchema,
} from './validation';
import type {
  GatewayOptions,
  GatewayMetadata,
  GatewayErrorCode,
  GatewayResult,
  OperationOutput,
  ModelGateway,
} from './types';

const requestSchema = z.strictObject({
  operation: z.string().min(1).max(128),
  input: z.unknown(),
  context: z.unknown(),
  signal: z.instanceof(AbortSignal),
});
export function createModelGateway({
  adapter,
  registry = createOperationRegistry(),
}: GatewayOptions): ModelGateway {
  return Object.freeze({
    async invoke(
      request,
    ): Promise<GatewayResult<OperationOutput['gateway_probe']>> {
      const started = performance.now();
      const metadata: {
        -readonly [K in keyof GatewayMetadata]: GatewayMetadata[K];
      } = {
        callId: randomUUID(),
        requestId: null,
        operationId: null,
        operation: 'unknown',
        provider: null,
        configuredModel: null,
        reportedModel: null,
        inputSchemaVersion: null,
        outputSchemaVersion: null,
        promptVersion: null,
        evaluationVersion: null,
        sessionId: null,
        expectedSessionVersion: null,
        packVersion: null,
        rubricVersion: null,
        policyVersion: null,
        attempts: 0,
        durationMs: 0,
        outcome: 'configuration_error',
        usage: null,
        estimatedCostUsd: null,
        actualCharge: 'unknown',
      };
      const finish = (outcome: GatewayMetadata['outcome']) =>
        Object.freeze({
          ...metadata,
          outcome,
          durationMs: Math.max(0, performance.now() - started),
        });
      const failure = (
        code: GatewayErrorCode,
        retryable = false,
      ): GatewayResult<never> =>
        Object.freeze({ ok: false, code, retryable, metadata: finish(code) });
      try {
        const parsed = requestSchema.safeParse(request);
        if (!parsed.success) return failure('invalid_request');
        const { operation, signal } = parsed.data;
        if (canonicalOperations.some((d) => d.name === operation))
          metadata.operation = operation;
        const context = requestContextSchema.safeParse(parsed.data.context);
        if (!context.success) return failure('invalid_request');
        metadata.requestId = context.data.requestId;
        metadata.operationId = context.data.operationId;
        metadata.sessionId = context.data.sessionId ?? null;
        metadata.expectedSessionVersion =
          context.data.expectedSessionVersion ?? null;
        metadata.packVersion = context.data.packVersion ?? null;
        metadata.rubricVersion = context.data.rubricVersion ?? null;
        metadata.policyVersion = context.data.policyVersion ?? null;
        if (signal.aborted) return failure('cancelled');
        const resolved = registry.resolve(operation);
        if (!resolved.ok) return failure(resolved.code);
        const definition = resolved.definition;
        metadata.provider = adapter.provider;
        metadata.configuredModel =
          adapter.provider === 'fake'
            ? 'fake-probe-v1'
            : definition.models[adapter.provider];
        metadata.inputSchemaVersion = definition.inputSchemaVersion;
        metadata.outputSchemaVersion = definition.outputSchemaVersion;
        metadata.promptVersion = definition.prompt.version;
        metadata.evaluationVersion = definition.evaluationVersion;
        const input = probeInputSchema.safeParse(parsed.data.input);
        if (!input.success) return failure('invalid_request');
        metadata.attempts = 1;
        const response = await adapter.send(
          Object.freeze({
            operation: 'gateway_probe',
            input: Object.freeze(input.data),
            model: metadata.configuredModel,
            prompt: definition.prompt.body,
            outputJsonSchema: definition.outputJsonSchema,
            limits: definition.limits,
            callId: metadata.callId,
            attemptId: randomUUID(),
            operationId: context.data.operationId,
          }),
          signal,
        );
        if (signal.aborted) return failure('cancelled');
        if (response.status === 'failure')
          return failure(response.code, response.retryable);
        if (response.status === 'refused') return failure('refused');
        if (response.status === 'truncated') return failure('output_limit');
        if (response.status !== 'complete') return failure('invalid_output');
        let output: unknown;
        try {
          output = JSON.parse(response.text);
        } catch {
          return failure('invalid_output');
        }
        const validated = probeOutputSchema.safeParse(output);
        if (!validated.success) return failure('invalid_output');
        // A provider-controlled label cannot inject arbitrary metadata or log labels.
        metadata.reportedModel =
          response.reportedModel === metadata.configuredModel
            ? response.reportedModel
            : null;
        return Object.freeze({
          ok: true,
          data: Object.freeze(validated.data),
          metadata: finish('success'),
        });
      } catch {
        return failure('configuration_error');
      }
    },
  });
}
