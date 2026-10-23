import type { EnabledDefinition, OperationRegistry } from './operations';

export type EnabledOperation = 'gateway_probe';
export type OperationInput = { gateway_probe: Readonly<{ text: string }> };
export type OperationOutput = {
  gateway_probe: Readonly<{ schemaVersion: 1; acknowledged: true }>;
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
  usage: unknown;
  estimatedCostUsd: number | null;
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
export type AdapterResult =
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
    }>;
export type GatewayAdapter = Readonly<{
  provider: GatewayProvider;
  send(request: AdapterRequest, signal: AbortSignal): Promise<AdapterResult>;
}>;
export type GatewayOptions = Readonly<{
  adapter: GatewayAdapter;
  registry?: OperationRegistry;
}>;
export type ModelGateway = Readonly<{
  invoke<K extends EnabledOperation>(
    request: GatewayRequest<K>,
  ): Promise<GatewayResult<OperationOutput[K]>>;
}>;
