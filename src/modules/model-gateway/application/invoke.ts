import { randomUUID } from 'node:crypto';
import {
  abortable,
  createAdmission,
  createScope,
  reservation,
  safely,
  retryDelay,
  sleep,
} from './budgets';
import { z } from 'zod';
import {
  normalizeUsage,
  summarizeUsage,
  estimateUsage,
  type AttemptMetadata,
} from './metadata';
import { canonicalOperations, createOperationRegistry } from './operations';
import { requestContextSchema } from './validation';
import type {
  GatewayOptions,
  GatewayMetadata,
  GatewayErrorCode,
  GatewayResult,
  EnabledOperation,
  GatewayRequest,
  OperationOutput,
  ModelGateway,
  AdapterResult,
  AdapterRequest,
  PreparedAdapterRequest,
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
  environment,
  rateCard: configuredRateCard,
  signal: shutdownSignal,
  onCompleted,
}: GatewayOptions): ModelGateway {
  // One trusted configuration revision governs admission and all attempt/final estimates.
  const rateCard = configuredRateCard
    ? Object.freeze({
        version: configuredRateCard.version,
        reviewed: configuredRateCard.reviewed,
        model: configuredRateCard.model,
        inputUsdPerMillion: configuredRateCard.inputUsdPerMillion,
        outputUsdPerMillion: configuredRateCard.outputUsdPerMillion,
        ...(configuredRateCard.cachedInputUsdPerMillion === undefined
          ? {}
          : {
              cachedInputUsdPerMillion:
                configuredRateCard.cachedInputUsdPerMillion,
            }),
      })
    : undefined;
  const admission = createAdmission();
  const shutdown = new AbortController();
  return Object.freeze({
    async close() {
      shutdown.abort();
      await adapter.close?.();
    },
    destroy() {
      shutdown.abort();
      safely(() => adapter.destroy?.());
    },
    async invoke<K extends EnabledOperation>(
      request: GatewayRequest<K>,
    ): Promise<GatewayResult<OperationOutput[K]>> {
      const started = performance.now();
      const ledger: {
        -readonly [K in keyof AttemptMetadata]: AttemptMetadata[K];
      }[] = [];
      let finalized: GatewayMetadata | undefined;
      let release: (() => void) | null = null;
      let total: ReturnType<typeof createScope> | undefined;
      let caller: AbortSignal | undefined;
      const cancelled = () =>
        !!(
          caller?.aborted ||
          shutdown.signal.aborted ||
          shutdownSignal?.aborted
        );
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
        usage: summarizeUsage([]),
        costCompleteness: 'unknown',
        rateCardVersion: null,
        estimatedCostUsd: null,
        reservedCostUsd: null,
        actualCharge: 'unknown',
      };
      const cleanup = () => {
        if (total) {
          const owned = total;
          total = undefined;
          safely(() => owned.close());
        }
        if (release) {
          const owned = release;
          release = null;
          safely(owned);
        }
      };
      const finish = (outcome: GatewayMetadata['outcome']) => {
        if (finalized) return finalized;
        cleanup();
        const usage = summarizeUsage(ledger);
        const knownCosts = ledger
          .map((a) => a.estimatedCostUsd)
          .filter((v): v is number => v !== null);
        const sum = knownCosts.reduce((a, b) => a + b, 0);
        finalized = Object.freeze({
          ...metadata,
          usage,
          outcome,
          rateCardVersion:
            metadata.configuredModel &&
            reservation(rateCard, metadata.configuredModel, 1, 0, 1) !== null
              ? rateCard!.version
              : null,
          estimatedCostUsd:
            knownCosts.length && Number.isFinite(sum) ? sum : null,
          costCompleteness: !knownCosts.length
            ? 'unknown'
            : knownCosts.length === ledger.length
              ? 'complete'
              : 'partial',
          durationMs: Math.max(0, performance.now() - started),
        });
        if (onCompleted) safely(() => onCompleted(finalized!));
        return finalized;
      };
      const failure = (
        code: GatewayErrorCode,
        retryable = false,
      ): GatewayResult<never> =>
        Object.freeze({ ok: false, code, retryable, metadata: finish(code) });
      try {
        const parsed = requestSchema.safeParse(request);
        if (!parsed.success) return failure('invalid_request');
        const { operation, signal } = parsed.data;
        caller = signal;
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
        if (cancelled()) return failure('cancelled');
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
        const input = definition.inputSchema.safeParse(parsed.data.input);
        if (!input.success) return failure('invalid_request');
        if (
          adapter.provider !== 'fake' &&
          (environment === undefined ||
            environment === 'test' ||
            (adapter.provider === 'groq' && environment !== 'development'))
        )
          return failure('configuration_error');
        release = admission.acquire(definition.limits.maxConcurrent);
        if (!release) return failure('saturated', true);
        total = createScope(
          [
            signal,
            shutdown.signal,
            ...(shutdownSignal ? [shutdownSignal] : []),
          ],
          definition.limits.totalTimeoutMs - (performance.now() - started),
        );
        const deadline = started + definition.limits.totalTimeoutMs;
        const interrupted = (record?: {
          outcome: GatewayMetadata['outcome'];
        }) => {
          const code = cancelled()
            ? 'cancelled'
            : performance.now() >= deadline || total!.expired
              ? 'timeout'
              : null;
          if (!code) return null;
          if (record) record.outcome = code;
          return failure(code, code === 'timeout');
        };
        for (
          let attempt = 1;
          attempt <= definition.limits.maxAttempts;
          attempt++
        ) {
          const before = interrupted();
          if (before) return before;
          const adapterRequest: AdapterRequest = Object.freeze({
            operation: operation as EnabledOperation,
            input: Object.freeze(input.data),
            model: metadata.configuredModel,
            prompt: definition.prompt.body,
            outputJsonSchema: definition.outputJsonSchema,
            limits: definition.limits,
            callId: metadata.callId,
            attemptId: randomUUID(),
            operationId: context.data.operationId,
          });
          const prepared: PreparedAdapterRequest | null = adapter.prepare
            ? await abortable(
                () => adapter.prepare!(adapterRequest, total!.signal),
                total.signal,
              )
            : null;
          const afterPreparation = interrupted();
          if (afterPreparation) return afterPreparation;
          const reserved = reservation(
            rateCard,
            metadata.configuredModel,
            prepared?.inputTokenUpperBound ?? null,
            definition.limits.completionTokens,
            definition.limits.maxAttempts,
          );
          if (environment === 'production' || environment === 'staging') {
            if (
              reserved === null ||
              definition.limits.estimatedCostUsd === null ||
              reserved > definition.limits.estimatedCostUsd
            )
              return failure('budget_exceeded', true);
            metadata.reservedCostUsd = reserved;
          }
          const scope = createScope(
            [total.signal],
            Math.min(
              definition.limits.attemptTimeoutMs,
              deadline - performance.now(),
            ),
          );
          let response: AdapterResult = {
            status: 'failure',
            code: 'configuration_error',
            retryable: false,
            internalRetry: false,
          };
          const attemptStarted = performance.now();
          const record = {
            attempt,
            attemptId: adapterRequest.attemptId,
            durationMs: 0,
            outcome: 'configuration_error' as GatewayMetadata['outcome'],
            usage: normalizeUsage(null),
            estimatedCostUsd: null as number | null,
          };
          try {
            response = await abortable(() => {
              metadata.attempts++;
              ledger.push(record);
              return prepared
                ? prepared.send(scope.signal)
                : adapter.send(adapterRequest, scope.signal);
            }, scope.signal);
          } catch {
            if (cancelled() || total.expired || performance.now() >= deadline) {
              response = {
                status: 'failure',
                code: cancelled() ? 'cancelled' : 'timeout',
                retryable: !cancelled(),
                internalRetry: false,
              };
            } else if (scope.expired)
              response = {
                status: 'failure',
                code: 'timeout',
                retryable: true,
                internalRetry: true,
              };
            else throw new Error('adapter_failure');
          } finally {
            safely(() => scope.close());
            record.durationMs = Math.max(0, performance.now() - attemptStarted);
            if (response) {
              record.usage = normalizeUsage(response.usage);
              record.estimatedCostUsd = estimateUsage(
                record.usage,
                rateCard,
                metadata.configuredModel,
              );
              if (response.reportedModel === metadata.configuredModel)
                metadata.reportedModel = response.reportedModel;
            }
          }
          const after = interrupted(record);
          if (after) return after;
          if (
            record.usage.outputTokens !== null &&
            record.usage.outputTokens > definition.limits.completionTokens
          ) {
            record.outcome = 'output_limit';
            return failure('output_limit');
          }
          if (response.status === 'failure') {
            record.outcome = response.code;
            if (
              !response.internalRetry ||
              !['provider_unavailable', 'rate_limited', 'timeout'].includes(
                response.code,
              ) ||
              attempt === definition.limits.maxAttempts
            )
              return failure(response.code, response.retryable);
            const delay = retryDelay(
              response.retryAfter,
              response.retryAfterMs,
            );
            if (delay > 2000 || delay >= deadline - performance.now())
              return failure(response.code, response.retryable);
            await sleep(delay, total.signal);
            continue;
          }
          const attemptFailure = (code: GatewayErrorCode) => {
            record.outcome = code;
            return failure(code);
          };
          if (response.status === 'refused') return attemptFailure('refused');
          if (response.status === 'truncated')
            return attemptFailure('output_limit');
          if (response.status !== 'complete')
            return attemptFailure('invalid_output');
          if (
            Buffer.byteLength(response.text, 'utf8') >
            definition.limits.responseBytes
          )
            return attemptFailure('output_limit');
          let output: unknown;
          try {
            output = JSON.parse(response.text);
          } catch {
            return attemptFailure('invalid_output');
          }
          const validated = definition.outputSchema.safeParse(output);
          if (!validated.success) return attemptFailure('invalid_output');
          // A provider-controlled label cannot inject arbitrary metadata or log labels.
          metadata.reportedModel =
            response.reportedModel === metadata.configuredModel
              ? response.reportedModel
              : null;
          record.outcome = 'success';
          const afterValidation = interrupted(record);
          if (afterValidation) return afterValidation;
          return Object.freeze({
            ok: true,
            // The resolved definition's own outputSchema already validated this operation's
            // output above; this cast carries that runtime guarantee into the generic result type.
            data: Object.freeze(validated.data) as OperationOutput[K],
            metadata: finish('success'),
          });
        }
        return failure('configuration_error');
      } catch {
        return cancelled()
          ? failure('cancelled')
          : total?.expired
            ? failure('timeout', true)
            : failure('configuration_error');
      } finally {
        cleanup();
      }
    },
  });
}
