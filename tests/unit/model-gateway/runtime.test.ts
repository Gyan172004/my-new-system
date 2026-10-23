import { afterEach, expect, it, vi } from 'vitest';
import {
  parseRuntimeConfig,
  parseModelGatewayConfig,
} from '../../../src/server/config';
import { createRuntime } from '../../../src/server/runtime';
import {
  runtimeModelGateway,
  createSyntheticProbeRunner,
} from '../../../src/server/model-gateway';
import { createModelGateway } from '../../../src/modules/model-gateway/public';
import { probeInput, probeContext } from '../../fixtures/model-gateway/probe';
const settings = (adapter = 'fake', environment = 'test') => ({
  APP_ENV: environment,
  MODEL_GATEWAY_ADAPTER: adapter,
  DATABASE_URL: 'postgresql://unreachable.invalid/test?sslmode=verify-full',
  OPENAI_API_KEY: 'dummy-openai',
  GROQ_API_KEY: 'dummy-groq',
  LOG_LEVEL: 'silent',
});
const request = () => ({
  operation: 'gateway_probe' as const,
  input: probeInput,
  context: probeContext,
  signal: new AbortController().signal,
});
afterEach(() => vi.restoreAllMocks());
it('leaves disabled gateway lazy and makes no provider call', () => {
  const fetch = vi
    .spyOn(globalThis, 'fetch')
    .mockRejectedValue(Error('must_not_dispatch'));
  expect(
    runtimeModelGateway(
      createRuntime(parseRuntimeConfig(settings('disabled'))),
    ),
  ).toBeUndefined();
  expect(fetch).not.toHaveBeenCalled();
});
it('reuses one gateway across module reload and disallows resource resurrection after drain', async () => {
  const runtime = createRuntime(parseRuntimeConfig(settings()));
  const first = runtimeModelGateway(runtime)!;
  vi.resetModules();
  const reloaded = await import('../../../src/server/model-gateway');
  expect(reloaded.runtimeModelGateway(runtime)).toBe(first);
  expect(await first.invoke(request())).toMatchObject({ ok: true });
  runtime.state = 'VALIDATING';
  runtime.state = 'DRAINING';
  await runtime.closeResources();
  expect(await first.invoke(request())).toMatchObject({
    code: 'cancelled',
    metadata: { attempts: 0 },
  });
  expect(() => reloaded.runtimeModelGateway(runtime)).toThrow(
    'runtime_draining',
  );
});
it.each(['close', 'destroy'] as const)(
  'runtime %s cancels active native transport and future calls',
  async (action) => {
    let aborted = false;
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      async (_url, options) =>
        new Promise((_resolve, reject) => {
          options!.signal!.addEventListener(
            'abort',
            () => {
              aborted = true;
              reject(Error('CANARY_PROVIDER'));
            },
            { once: true },
          );
        }),
    );
    const runtime = createRuntime(
      parseRuntimeConfig(settings('openai', 'development')),
    );
    const gateway = runtimeModelGateway(runtime)!;
    const active = gateway.invoke(request());
    await new Promise((resolve) => setImmediate(resolve));
    if (action === 'close') await runtime.closeResources();
    else runtime.destroyResources();
    expect(await active).toMatchObject({ code: 'cancelled' });
    expect(aborted).toBe(true);
    expect(await gateway.invoke(request())).toMatchObject({
      code: 'cancelled',
      metadata: { attempts: 0 },
    });
  },
);
it('refuses generic Groq composition and accepts only the fixed fixture runner', async () => {
  const runtime = createRuntime(
    parseRuntimeConfig(settings('groq', 'development')),
  );
  expect(() => runtimeModelGateway(runtime)).toThrow('MODEL_GATEWAY_ADAPTER');
  expect(() =>
    createSyntheticProbeRunner(runtime.config.modelGateway, 'arbitrary-CANARY'),
  ).toThrow('invalid_probe_fixture');
  const runner = createSyntheticProbeRunner(
    parseModelGatewayConfig(settings()),
    'gateway-probe-v1',
  );
  expect('invoke' in runner).toBe(false);
  expect(await runner.run(new AbortController().signal)).toMatchObject({
    ok: true,
  });
  await runner.close();
});
it('rejects a disabled adapter configuration passed directly to the trusted probe runner', () => {
  expect(() =>
    createSyntheticProbeRunner(
      parseModelGatewayConfig(settings('disabled', 'development')),
      'gateway-probe-v1',
    ),
  ).toThrow('MODEL_GATEWAY_ADAPTER');
});
it('destroys an idle trusted probe runner', async () => {
  const runner = createSyntheticProbeRunner(
    parseModelGatewayConfig(settings()),
    'gateway-probe-v1',
  );
  runner.destroy();
  expect(await runner.run(new AbortController().signal)).toMatchObject({
    code: 'cancelled',
  });
});
it.each([
  ['openai', 'test'],
  ['groq', 'test'],
  ['groq', 'staging'],
  ['groq', 'production'],
] as const)(
  'core rejects %s in %s even if trusted composition was bypassed',
  async (provider, environment) => {
    let dispatches = 0;
    const gateway = createModelGateway({
      environment,
      adapter: {
        provider,
        async send() {
          dispatches++;
          return { status: 'refused' };
        },
      },
    });
    expect(await gateway.invoke(request())).toMatchObject({
      code: 'configuration_error',
      metadata: { attempts: 0 },
    });
    expect(dispatches).toBe(0);
  },
);
