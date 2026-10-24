import { expect, it } from 'vitest';
import {
  parseBuildConfig,
  parseRuntimeConfig,
} from '../../../src/server/config';
const base = {
  DATABASE_URL: 'postgresql://db.invalid/test?sslmode=verify-full',
};
const permitted: Record<string, readonly string[]> = {
  development: ['disabled', 'fake', 'groq', 'openai'],
  test: ['disabled', 'fake'],
  staging: ['disabled', 'openai'],
  production: ['disabled', 'openai'],
};
it('defaults to disabled without requiring unused provider keys', () => {
  expect(parseRuntimeConfig({ ...base, APP_ENV: 'test' })).toHaveProperty(
    'modelGateway.adapter',
    'disabled',
  );
});
for (const [APP_ENV, allowed] of Object.entries(permitted)) {
  for (const MODEL_GATEWAY_ADAPTER of ['disabled', 'fake', 'groq', 'openai']) {
    it(`${APP_ENV} ${allowed.includes(MODEL_GATEWAY_ADAPTER) ? 'accepts' : 'rejects'} ${MODEL_GATEWAY_ADAPTER}`, () => {
      const raw = {
        ...base,
        APP_ENV,
        MODEL_GATEWAY_ADAPTER,
        GROQ_API_KEY: 'dummy-groq',
        OPENAI_API_KEY: 'dummy-openai',
      };
      if (allowed.includes(MODEL_GATEWAY_ADAPTER))
        expect(parseRuntimeConfig(raw)).toHaveProperty(
          'modelGateway.adapter',
          MODEL_GATEWAY_ADAPTER,
        );
      else
        expect(() => parseRuntimeConfig(raw)).toThrow('MODEL_GATEWAY_ADAPTER');
    });
  }
}
it.each(['groq', 'openai'])(
  'requires only the selected %s key and rejects empty keys safely',
  (adapter) => {
    const selected = adapter === 'groq' ? 'GROQ_API_KEY' : 'OPENAI_API_KEY';
    const raw = {
      ...base,
      APP_ENV: 'development',
      MODEL_GATEWAY_ADAPTER: adapter,
    };
    for (const value of [
      undefined,
      '',
      ' ',
      'CANARY\nPRIVATE',
      'x'.repeat(4097),
    ])
      expect(() => parseRuntimeConfig({ ...raw, [selected]: value })).toThrow(
        selected,
      );
    expect(
      parseRuntimeConfig({ ...raw, [selected]: 'dummy-selected' }),
    ).toHaveProperty('modelGateway.adapter', adapter);
  },
);
it.each(['', 'unknown', 'OpenAI'])(
  'rejects invalid adapter %s',
  (MODEL_GATEWAY_ADAPTER) => {
    expect(() =>
      parseRuntimeConfig({
        ...base,
        APP_ENV: 'development',
        MODEL_GATEWAY_ADAPTER,
      }),
    ).toThrow('MODEL_GATEWAY_ADAPTER');
  },
);
it.each(['NEXT_PUBLIC_GROQ_API_KEY', 'NEXT_PUBLIC_OPENAI_API_KEY'])(
  'rejects %s in runtime and build',
  (key) => {
    expect(() =>
      parseRuntimeConfig({ ...base, APP_ENV: 'test', [key]: 'CANARY' }),
    ).toThrow(key);
    expect(() => parseBuildConfig({ [key]: 'CANARY' })).toThrow(key);
  },
);
