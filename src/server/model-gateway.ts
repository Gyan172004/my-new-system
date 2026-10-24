import {
  createFakeAdapter,
  createGroqAdapter,
  createModelGateway,
  createOpenAIAdapter,
  modelCallLogFields,
  syntheticProbeFixture,
  type GatewayMetadata,
  type ModelGateway,
} from '../modules/model-gateway/public';
import {
  ConfigurationError,
  parseModelGatewayConfig,
  type ModelGatewayConfig,
} from './config';
import { runtimeLogger } from './logger';
import { getRuntime, type RuntimeRegistry } from './runtime';

function compose(
  settings: ModelGatewayConfig,
  onCompleted?: (metadata: GatewayMetadata) => void,
): ModelGateway {
  // Revalidate trusted composition too; no injected transport or endpoint setting exists here.
  const config = parseModelGatewayConfig({
    APP_ENV: settings.environment,
    MODEL_GATEWAY_ADAPTER: settings.adapter,
    ...(settings.adapter === 'groq'
      ? { GROQ_API_KEY: settings.apiKey }
      : { OPENAI_API_KEY: settings.apiKey }),
  });
  if (config.adapter === 'disabled')
    throw new ConfigurationError(['MODEL_GATEWAY_ADAPTER']);
  const adapter =
    config.adapter === 'fake'
      ? createFakeAdapter()
      : config.adapter === 'groq'
        ? createGroqAdapter({ apiKey: config.apiKey! })
        : createOpenAIAdapter({ apiKey: config.apiKey! });
  return createModelGateway({
    adapter,
    environment: config.environment,
    ...(onCompleted ? { onCompleted } : {}),
  });
}
const gatewayKey = Symbol.for('dsa-interview.model-gateway.v1');
export function runtimeModelGateway(
  runtime: RuntimeRegistry = getRuntime(),
): ModelGateway | undefined {
  const config = runtime.config.modelGateway;
  if (config.adapter === 'disabled') return undefined;
  // Groq never returns a general invocation capability to routes/session consumers.
  if (config.adapter === 'groq')
    throw new ConfigurationError(['MODEL_GATEWAY_ADAPTER']);
  return runtime.getOrCreate(gatewayKey, () => {
    const logger = runtimeLogger(runtime);
    return compose(config, (metadata) =>
      logger.write('model_call_completed', modelCallLogFields(metadata)),
    );
  });
}

// Operator-only capability: callers choose a checked-in fixture, never its content.
// Low-level public factory injection remains trusted fixture-test composition.
export function createSyntheticProbeRunner(
  config: ModelGatewayConfig,
  fixture: string,
) {
  if (fixture !== syntheticProbeFixture.id)
    throw new Error('invalid_probe_fixture');
  const gateway = compose(config);
  return Object.freeze({
    run(signal: AbortSignal) {
      return gateway.invoke({
        operation: 'gateway_probe',
        input: syntheticProbeFixture.input,
        context: syntheticProbeFixture.context,
        signal,
      });
    },
    close: () => gateway.close(),
    destroy: () => gateway.destroy(),
  });
}
