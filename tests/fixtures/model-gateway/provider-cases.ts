import type { GatewayErrorCode } from '../../../src/modules/model-gateway/application/types';
export const httpCases: readonly {
  name: string;
  status: number;
  error?: unknown;
  code: GatewayErrorCode;
  retryable: boolean;
}[] = [
  ...[301, 302, 307, 308].map((status) => ({
    name: `redirect ${status}`,
    status,
    code: 'configuration_error' as const,
    retryable: false,
  })),
  ...[400, 413, 422].map((status) => ({
    name: `invalid input ${status}`,
    status,
    code: 'invalid_request' as const,
    retryable: false,
  })),
  {
    name: 'context limit',
    status: 400,
    error: { code: 'context_length_exceeded' },
    code: 'invalid_request',
    retryable: false,
  },
  ...[401, 403].map((status) => ({
    name: `access denial ${status}`,
    status,
    code: 'provider_auth_failed' as const,
    retryable: false,
  })),
  {
    name: 'missing model',
    status: 404,
    code: 'configuration_error',
    retryable: false,
  },
  { name: 'request timeout', status: 408, code: 'timeout', retryable: true },
  {
    name: 'unknown throttling',
    status: 429,
    error: {
      code: 'unknown',
      message: 'rate limit reached temporary quota exhausted',
    },
    code: 'provider_rejected',
    retryable: false,
  },
  ...[402, 409, 418, 499, 501, 505].map((status) => ({
    name: `unclassified ${status}`,
    status,
    code: 'provider_rejected' as const,
    retryable: false,
  })),
  ...[500, 502, 503, 504].map((status) => ({
    name: `unavailable ${status}`,
    status,
    code: 'provider_unavailable' as const,
    retryable: true,
  })),
];
export const openaiQuotaCodes = [
  'credit_balance_exhausted',
  'organization_spend_limit_exceeded',
  'project_spend_limit_exceeded',
  'organization_usage_limit_exceeded',
];
export const validText = '{"schemaVersion":1,"acknowledged":true}';
