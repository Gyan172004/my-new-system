import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import Ajv2020 from 'ajv/dist/2020.js';
import { expect, it } from 'vitest';

const contract = parse(readFileSync('contracts/api/v1_openapi.yaml', 'utf8'));
const validateError = new Ajv2020({ allErrors: true }).compile(
  contract.components.schemas.ApiError,
);

const protectedOperations = [
  ['get', '/problems'],
  ['get', '/problems/{problemId}'],
  ['post', '/interview-sessions'],
  ['get', '/interview-sessions/{sessionId}'],
  ['post', '/interview-sessions/{sessionId}'],
  ['post', '/interview-sessions/{sessionId}/voice-consent'],
  ['post', '/interview-sessions/{sessionId}/voice-turns'],
  ['post', '/interview-sessions/{sessionId}/turns/{turnId}/speech'],
] as const;

it.each(['/problems', '/problems/{problemId}'])(
  'lets catalogue consumers handle malformed input from GET %s as a safe 400',
  (path) => {
    const response = contract.paths[path].get.responses['400'];
    expect(
      response,
      `GET ${path} must declare malformed-input behavior`,
    ).toBeDefined();
    expect(response.$ref).toBe('#/components/responses/BadRequest');
    const errorSchema =
      contract.components.responses.BadRequest.content['application/json']
        .schema;
    expect(errorSchema).toEqual({ $ref: '#/components/schemas/ApiError' });
    expect(
      validateError({
        code: 'invalid_request',
        message: 'Check the request parameters.',
        requestId: 'catalogue-request',
        retryable: false,
      }),
    ).toBe(true);
    expect(
      validateError({
        code: 'invalid_request',
        message: 'Check the request parameters.',
        requestId: 123,
      }),
    ).toBe(false);
  },
);

// These are contract-consumer checks. Product handlers remain unimplemented.
it.each(protectedOperations)(
  '%s %s declares authentication, disabled-account, throttling and outage errors',
  (method, path) => {
    const operation = contract.paths[path][method];
    expect(operation.security ?? contract.security).toEqual([
      { bearerAuth: [] },
    ]);
    for (const status of ['401', '403', '429', '503']) {
      let response = operation.responses[status];
      expect(response, `${method} ${path} is missing ${status}`).toBeDefined();
      if (response.$ref) {
        const name = response.$ref.split('/').at(-1);
        response = contract.components.responses[name];
      }
      expect(response.content['application/json'].schema).toEqual({
        $ref: '#/components/schemas/ApiError',
      });
      if (status === '429') {
        expect(response.headers['Retry-After'].schema).toEqual({
          type: 'integer',
          minimum: 0,
        });
      }
    }
  },
);

it('lets consumers parse safe auth errors and rejects missing correlation or invalid retryability', () => {
  for (const body of [
    { code: 'unauthorized', message: 'Sign in again.', requestId: 'request-1' },
    { code: 'forbidden', message: 'Access denied.', requestId: 'request-2' },
    {
      code: 'rate_limited',
      message: 'Try again later.',
      requestId: 'request-3',
      retryable: true,
    },
    {
      code: 'dependency_unavailable',
      message: 'Try again later.',
      requestId: 'request-4',
      retryable: true,
    },
  ]) {
    expect(validateError(body), JSON.stringify(validateError.errors)).toBe(
      true,
    );
    const withoutCorrelation: Record<string, unknown> = { ...body };
    delete withoutCorrelation.requestId;
    expect(validateError(withoutCorrelation)).toBe(false);
    expect(validateError({ ...body, retryable: 'yes' })).toBe(false);
  }
});
