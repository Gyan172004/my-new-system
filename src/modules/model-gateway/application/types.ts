import type { z } from 'zod';
import type { Completeness, GatewayUsage } from './metadata';
import type { EnabledDefinition, OperationRegistry } from './operations';
import type {
  approachAssessmentInputSchema,
  approachAssessmentOutputSchema,
  interviewTurnInputSchema,
  interviewTurnOutputSchema,
} from './validation';

export type EnabledOperation =
  | 'approach_assessment'
  | 'gateway_probe'
  | 'interview_turn'
  | 'stage_classification'
  | 'intent_classification';
export type OperationInput = {
  approach_assessment: Readonly<z.infer<typeof approachAssessmentInputSchema>>;
  gateway_probe: Readonly<{ text: string }>;
  interview_turn: Readonly<z.infer<typeof interviewTurnInputSchema>>;
  // Deferred classification operations stay disabled stubs; these are minimal placeholders.
  stage_classification: Readonly<Record<string, unknown>>;
  intent_classification: Readonly<Record<string, unknown>>;
};
export type OperationOutput = {
  approach_assessment: Readonly<z.infer<typeof approachAssessmentOutputSchema>>;
  gateway_probe: Readonly<{ schemaVersion: 1; acknowledged: true }>;
  interview_turn: Readonly<z.infer<typeof interviewTurnOutputSchema>>;
  // Deferred classification operations stay disabled stubs; these are minimal placeholders.
  stage_classification: Readonly<Record<string, unknown>>;
  intent_classification: Readonly<Record<string, unknown>>;
};
export type GatewayContext = Readonly<{
  requestId: string;
  operationId: string;
  sessionId?: string;
  expectedSessionVersion?: number;
  packVersion?: string;
  rubricVersion?: string;
  policyVersion?: string;
}>;
export type GatewayRequest<K extends EnabledOperation = EnabledOperation> =
  Readonly<{
    operation: K;
    input: OperationInput[K];
    context: GatewayContext;
    signal: AbortSignal;
  }>;
export type GatewayErrorCode =
  | 'invalid_request'
  | 'operation_disabled'
  | 'unsupported_operation'
  | 'configuration_error'
  | 'provider_auth_failed'
  | 'quota_exhausted'
  | 'provider_rejected'
  | 'saturated'
  | 'budget_exceeded'
  | 'rate_limited'
  | 'provider_unavailable'
  | 'timeout'
  | 'cancelled'
  | 'invalid_output'
  | 'refused'
  | 'output_limit';
export type GatewayProvider = 'fake' | 'groq' | 'openai';
export type GatewayMetadata = Readonly<{
  callId: string;
  requestId: string | null;
  operationId: string | null;
  operation: string;
  provider: GatewayProvider | null;
  configuredModel: string | null;
  reportedModel: string | null;
  inputSchemaVersion: string | null;
  outputSchemaVersion: string | null;
  promptVersion: string | null;
  evaluationVersion: string | null;
  sessionId: string | null;
  expectedSessionVersion: number | null;
  packVersion: string | null;
  rubricVersion: string | null;
  policyVersion: string | null;
  attempts: number;
  durationMs: number;
  outcome: 'success' | GatewayErrorCode;
  usage: GatewayUsage;
  rateCardVersion: string | null;
  costCompleteness: Completeness;
  estimatedCostUsd: number | null;
  reservedCostUsd: number | null;
  actualCharge: 'unknown';
}>;
export type GatewayResult<T> =
  | Readonly<{ ok: true; data: T; metadata: GatewayMetadata }>
  | Readonly<{
      ok: false;
      code: GatewayErrorCode;
      retryable: boolean;
      metadata: GatewayMetadata;
    }>;
export type AdapterRequest = Readonly<{
  operation: EnabledOperation;
  input: OperationInput[EnabledOperation];
  model: string;
  prompt: string;
  outputJsonSchema: Readonly<Record<string, unknown>>;
  limits: EnabledDefinition['limits'];
  callId: string;
  attemptId: string;
  operationId: string;
}>;
export type AdapterResult = Readonly<{
  usage?: unknown;
  reportedModel?: string | null;
}> &
  (
    | Readonly<{
        status: 'complete';
        text: string;
        reportedModel: string | null;
        usage: unknown;
      }>
    | Readonly<{ status: 'refused' | 'truncated' | 'tool_output' }>
    | Readonly<{
        status: 'failure';
        code: GatewayErrorCode;
        retryable: boolean;
        internalRetry: boolean;
        retryAfterMs?: number;
        retryAfter?: string;
      }>
  );
export type PreparedAdapterRequest = Readonly<{
  inputTokenUpperBound: number | null;
  send(signal: AbortSignal): Promise<AdapterResult>;
}>;
export type RateCard = Readonly<{
  version: string;
  reviewed: boolean;
  model: string;
  inputUsdPerMillion: number;
  outputUsdPerMillion: number;
  cachedInputUsdPerMillion?: number;
}>;
export type GatewayAdapter = Readonly<{
  provider: GatewayProvider;
  send(request: AdapterRequest, signal: AbortSignal): Promise<AdapterResult>;
  // Preparation builds a bounded immutable wire request without dispatch or retained IO resources.
  // Null means the reviewed conservative input-token bound is unavailable.
  prepare?(
    request: AdapterRequest,
    signal: AbortSignal,
  ): Promise<PreparedAdapterRequest>;
  close?(): Promise<void>;
  destroy?(): void;
}>;
export type GatewayOptions = Readonly<{
  adapter: GatewayAdapter;
  registry?: OperationRegistry;
  environment?: 'development' | 'test' | 'staging' | 'production';
  rateCard?: RateCard;
  onCompleted?(metadata: GatewayMetadata): void;
  signal?: AbortSignal;
}>;
export type ModelGateway = Readonly<{
  close(): Promise<void>;
  destroy(): void;
  invoke<K extends EnabledOperation>(
    request: GatewayRequest<K>,
  ): Promise<GatewayResult<OperationOutput[K]>>;
}>;
