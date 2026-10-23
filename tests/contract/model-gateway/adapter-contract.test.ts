import { expect, it } from 'vitest';
import * as transport from '../../../src/modules/model-gateway/adapters/transport';
import {
  httpCases,
  openaiQuotaCodes,
} from '../../fixtures/model-gateway/provider-cases';
// The matrix is literal independent evidence; messages intentionally resemble retry/credit conditions.
for (const provider of ['groq', 'openai'] as const) {
  it.each(httpCases)(
    `${provider}: $name is safely classified`,
    ({ status, error, code, retryable }) => {
      expect(transport).toHaveProperty('classifyProviderHttp');
      const result = transport.classifyProviderHttp(
        provider,
        status,
        { error: { message: 'SECRET_CANARY', ...Object(error) } },
        '1',
      );
      expect(result).toMatchObject({
        status: 'failure',
        code,
        retryable,
        internalRetry: retryable,
      });
      expect(JSON.stringify(result)).not.toContain('SECRET_CANARY');
      expect(result && Object.keys(result)).not.toContain('body');
    },
  );
}
it.each(openaiQuotaCodes)('OpenAI quota code %s is terminal', (code) => {
  expect(transport).toHaveProperty('classifyProviderHttp');
  expect(
    transport.classifyProviderHttp('openai', 429, { error: { code } }, '1'),
  ).toMatchObject({
    code: 'quota_exhausted',
    retryable: false,
    internalRetry: false,
  });
});
it('only verified OpenAI throttling is transient; Groq does not inherit OpenAI machine codes', () => {
  expect(transport).toHaveProperty('classifyProviderHttp');
  expect(
    transport.classifyProviderHttp(
      'openai',
      429,
      { error: { type: 'rate_limit_error', code: 'slow_down' } },
      '1',
    ),
  ).toEqual({
    status: 'failure',
    code: 'rate_limited',
    retryable: true,
    internalRetry: true,
    retryAfter: '1',
  });
  expect(
    transport.classifyProviderHttp(
      'groq',
      429,
      { error: { type: 'rate_limit_error', code: 'slow_down' } },
      '1',
    ),
  ).toMatchObject({ code: 'provider_rejected', retryable: false });
  expect(
    transport.classifyProviderHttp(
      'openai',
      429,
      { error: { type: 'insufficient_quota' } },
      null,
    ),
  ).toMatchObject({ code: 'quota_exhausted', retryable: false });
  expect(transport.classifyProviderHttp('openai', 200, {}, null)).toBeNull();
});
it('malformed machine codes cannot throw or turn unknown throttling into retryable transport failure', () => {
  expect(
    transport.classifyProviderHttp(
      'openai',
      429,
      { error: { code: { toString: 'SECRET_CANARY' } } },
      null,
    ),
  ).toMatchObject({ code: 'provider_rejected', retryable: false });
});
