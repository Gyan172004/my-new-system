// Trusted server-only composition and consumer boundary. No provider configuration is accepted by invoke.
export { createModelGateway } from './application/invoke';
export { createFakeAdapter } from './adapters/fake';
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
  AdapterRequest,
  AdapterResult,
  GatewayOptions,
  ModelGateway,
} from './application/types';
