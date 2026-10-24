import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  ConfigurationError,
  parseModelGatewayConfig,
} from '../src/server/config';
import { createSyntheticProbeRunner } from '../src/server/model-gateway';
import { modelCallLogFields } from '../src/modules/model-gateway/public';

export function parseSmokeArguments(args: readonly string[]) {
  const invalid = () => {
    throw Error('invalid_smoke_arguments');
  };
  const values = new Map<string, string>();
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index]!;
    const value = args[index + 1];
    if (
      !['--adapter', '--fixture', '--count'].includes(key) ||
      values.has(key) ||
      value === undefined
    )
      invalid();
    values.set(key, value!);
  }
  const adapter = values.get('--adapter');
  if (adapter !== 'fake' && adapter !== 'groq' && adapter !== 'openai')
    return invalid();
  const fixture = values.get('--fixture') ?? 'gateway-probe-v1';
  const count = values.get('--count') ?? '1';
  if (fixture !== 'gateway-probe-v1' || !/^[1-5]$/.test(count))
    return invalid();
  return Object.freeze({ adapter, fixture, count: Number(count) });
}
export async function runSmoke(
  args: readonly string[],
  environment: Readonly<Record<string, string | undefined>>,
  options: { signal: AbortSignal; write(line: string): void },
): Promise<number> {
  const argsConfig = parseSmokeArguments(args);
  const config = parseModelGatewayConfig({
    ...environment,
    MODEL_GATEWAY_ADAPTER: argsConfig.adapter,
  });
  const runner = createSyntheticProbeRunner(config, argsConfig.fixture);
  let status = 0;
  try {
    // One runner/limiter, no parallel calls. Each core invocation permits at most two attempts.
    for (let index = 0; index < argsConfig.count; index++) {
      if (options.signal.aborted) {
        status = 1;
        break;
      }
      const result = await runner.run(options.signal);
      options.write(
        JSON.stringify({
          fixture: argsConfig.fixture,
          configVersion: 'model-gateway-v1',
          ...modelCallLogFields(result.metadata),
        }) + '\n',
      );
      if (!result.ok) status = 1;
      if (options.signal.aborted) break;
    }
    return status;
  } finally {
    await runner.close();
  }
}
export async function smokeMain(
  args: readonly string[],
  environment: Readonly<Record<string, string | undefined>>,
) {
  const controller = new AbortController();
  const stop = () => controller.abort();
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  try {
    return await runSmoke(args, environment, {
      signal: controller.signal,
      write: (line) => {
        process.stdout.write(line);
      },
    });
  } catch (error) {
    const code =
      error instanceof ConfigurationError
        ? error.message
        : error instanceof Error && error.message === 'invalid_smoke_arguments'
          ? error.message
          : 'model_gateway_smoke_failed';
    process.stderr.write(code + '\n');
    return 1;
  } finally {
    process.off('SIGINT', stop);
    process.off('SIGTERM', stop);
  }
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  process.exitCode = await smokeMain(process.argv.slice(2), process.env);
}
