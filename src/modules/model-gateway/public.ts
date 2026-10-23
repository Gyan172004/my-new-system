// Trusted server-only composition and consumer boundary. No provider configuration is accepted by invoke.
export { createModelGateway } from './application/invoke';
export { createFakeAdapter } from './adapters/fake';
export { modelCallLogFields } from './application/metadata';
export type {
  Completeness,
  TokenCounts,
  AttemptUsage,
  AttemptMetadata,
  GatewayUsage,
} from './application/metadata';
export type {
  EnabledOperation,
  OperationInput,
  OperationOutput,
  GatewayContext,
  GatewayRequest,
  GatewayResult,
  GatewayMetadata,
  GatewayErrorCode,
  GatewayProvider,
  GatewayAdapter,
  PreparedAdapterRequest,
  RateCard,
  AdapterRequest,
  AdapterResult,
  GatewayOptions,
  ModelGateway,
} from './application/types';
export { createGroqAdapter } from './adapters/groq';
export { createOpenAIAdapter } from './adapters/openai';
