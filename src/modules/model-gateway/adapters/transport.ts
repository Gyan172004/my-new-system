import { abortable, safely } from '../application/budgets';
import type {
  AdapterRequest,
  AdapterResult,
  GatewayAdapter,
  GatewayErrorCode,
  PreparedAdapterRequest,
} from '../application/types';
import { createOperationRegistry } from '../application/operations';
import { probeInputSchema, probeOutputSchema } from '../application/validation';
export type TransportRequest = Readonly<{
  body: string;
  apiKey: string;
  signal: AbortSignal;
  limits: Readonly<{ requestBytes: number; responseBytes: number }>;
}>;
export type TransportResult =
  | Readonly<{
      ok: true;
      status: number;
      body: string;
      contentType: string | null;
      retryAfter: string | null;
    }>
  | Readonly<{
      ok: false;
      code: GatewayErrorCode;
      retryable: boolean;
      internalRetry: boolean;
    }>;
export type ProviderTransport = Readonly<{
  send(request: TransportRequest): Promise<TransportResult>;
  close(): Promise<void>;
  destroy(): void;
}>;
const endpoints = Object.freeze({
  groq: 'https://api.groq.com/openai/v1/chat/completions',
  openai: 'https://api.openai.com/v1/responses',
});
// Trusted dependency injection permits owned fixture HTTP; runtime composition uses native fetch.
// No endpoint, URL or environment override is accepted.
export function createProviderTransport(
  provider: 'openai' | 'groq',
  fetchImplementation: typeof fetch = fetch,
): ProviderTransport {
  const shutdown = new AbortController();
  return Object.freeze({
    async close() {
      shutdown.abort();
    },
    destroy() {
      shutdown.abort();
    },
    async send({
      body,
      apiKey,
      signal,
      limits,
    }: TransportRequest): Promise<TransportResult> {
      const fail = (
        code: GatewayErrorCode,
        retryable = false,
        internalRetry = false,
      ): TransportResult => ({ ok: false, code, retryable, internalRetry });
      if (signal.aborted || shutdown.signal.aborted) return fail('cancelled');
      const requestCap = Math.min(limits.requestBytes, 16_384);
      const responseCap = Math.min(limits.responseBytes, 131_072);
      if (
        !Number.isSafeInteger(requestCap) ||
        requestCap < 1 ||
        !Number.isSafeInteger(responseCap) ||
        responseCap < 1
      )
        return fail('configuration_error');
      if (Buffer.byteLength(body, 'utf8') > requestCap)
        return fail('invalid_request');
      const controller = new AbortController();
      const abort = () => controller.abort();
      signal.addEventListener('abort', abort, { once: true });
      shutdown.signal.addEventListener('abort', abort, { once: true });
      let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
      let pendingResponse: Response | undefined;
      const disposePendingResponse = () => {
        const owned = pendingResponse;
        pendingResponse = undefined;
        if (owned)
          safely(() => {
            void owned.body?.cancel().catch(() => {});
          });
      };
      try {
        const response = await abortable(
          () =>
            fetchImplementation(endpoints[provider], {
              method: 'POST',
              headers: {
                'content-type': 'application/json',
                authorization: `Bearer ${apiKey}`,
              },
              body,
              signal: controller.signal,
              redirect: 'manual',
            }).then((response) => {
              // Retain ownership through the promise handoff: abort may win the next microtask.
              pendingResponse = response;
              if (controller.signal.aborted) disposePendingResponse();
              return response;
            }),
          controller.signal,
        );
        reader = response.body?.getReader();
        pendingResponse = undefined;
        if (response.status >= 300 && response.status < 400)
          return fail('configuration_error');
        const declared = response.headers.get('content-length');
        if (
          declared !== null &&
          /^\d+$/.test(declared) &&
          Number(declared) > responseCap
        )
          return fail('output_limit');
        const chunks: Uint8Array[] = [];
        let size = 0;
        if (reader) {
          while (true) {
            const chunk = await abortable(
              () => reader!.read(),
              controller.signal,
            );
            if (chunk.done) break;
            size += chunk.value.byteLength;
            if (size > responseCap) return fail('output_limit');
            chunks.push(chunk.value);
          }
        }
        if (signal.aborted || shutdown.signal.aborted) return fail('cancelled');
        const joined = new Uint8Array(size);
        let offset = 0;
        for (const chunk of chunks) {
          joined.set(chunk, offset);
          offset += chunk.byteLength;
        }
        let text: string;
        try {
          text = new TextDecoder('utf-8', { fatal: true }).decode(joined);
        } catch {
          return fail('invalid_output');
        }
        return {
          ok: true,
          status: response.status,
          body: text,
          contentType: response.headers.get('content-type'),
          retryAfter: response.headers.get('retry-after'),
        };
      } catch {
        return signal.aborted || shutdown.signal.aborted
          ? fail('cancelled')
          : fail('provider_unavailable', true, true);
      } finally {
        safely(() => controller.abort());
        disposePendingResponse();
        if (reader) {
          safely(() => {
            void reader!.cancel().catch(() => {});
          });
          safely(() => reader!.releaseLock());
        }
        safely(() => signal.removeEventListener('abort', abort));
        safely(() => shutdown.signal.removeEventListener('abort', abort));
      }
    },
  });
}

export function providerRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
export function adapterFailure(
  code: GatewayErrorCode,
  retryable = false,
): import('../application/types').AdapterResult {
  return { status: 'failure', code, retryable, internalRetry: retryable };
}
// Only documented machine identifiers are recognized. In particular Groq's HTTP
// 429 documentation does not establish a transient machine code: fail closed.
// Sources: https://developers.openai.com/api/docs/guides/error-codes
// https://console.groq.com/docs/errors ; no message text enters classification.
export function classifyProviderHttp(
  provider: 'groq' | 'openai',
  status: number,
  envelope: unknown,
  retryAfter: string | null,
): import('../application/types').AdapterResult | null {
  if (status >= 200 && status < 300) return null;
  if ((status >= 300 && status < 400) || status === 404)
    return adapterFailure('configuration_error');
  if (status === 401 || status === 403)
    return adapterFailure('provider_auth_failed');
  if ([400, 413, 422].includes(status))
    return adapterFailure('invalid_request');
  if (status === 408) return adapterFailure('timeout', true);
  if ([500, 502, 503, 504].includes(status))
    return adapterFailure('provider_unavailable', true);
  if (status === 429 && provider === 'openai') {
    const error = providerRecord(providerRecord(envelope).error);
    if (
      (typeof error.code === 'string' &&
        [
          'credit_balance_exhausted',
          'organization_spend_limit_exceeded',
          'project_spend_limit_exceeded',
          'organization_usage_limit_exceeded',
          'insufficient_quota',
        ].includes(error.code)) ||
      error.type === 'insufficient_quota'
    )
      return adapterFailure('quota_exhausted');
    if (error.type === 'rate_limit_error' && error.code === 'slow_down') {
      // Retry-After remains internal; never projected into public metadata/logs.
      return {
        ...adapterFailure('rate_limited', true),
        ...(retryAfter !== null && retryAfter.length <= 128
          ? { retryAfter }
          : {}),
      };
    }
  }
  return adapterFailure('provider_rejected');
}

export type TextAdapterOptions = Readonly<{
  apiKey: string;
  // Trusted constructor injection for owned fixtures; never runtime configuration.
  transport?: ProviderTransport;
}>;
// Shared resource/validation boundary; wire encoding and decoding remain provider-specific.
export function createTextAdapter(
  provider: 'groq' | 'openai',
  options: TextAdapterOptions,
  encode: (request: AdapterRequest) => unknown,
  decode: (
    envelope: Record<string, unknown>,
    request: AdapterRequest,
  ) => AdapterResult,
): GatewayAdapter {
  const apiKey = options.apiKey;
  const transport = options.transport ?? createProviderTransport(provider);
  const shutdown = new AbortController();
  async function prepare(
    request: AdapterRequest,
    signal: AbortSignal,
  ): Promise<PreparedAdapterRequest> {
    let invalid: AdapterResult | null = null;
    let body = '';
    let preparedRequest = request;
    let limits = { requestBytes: 0, responseBytes: 0 };
    try {
      const operation = createOperationRegistry().resolve(request.operation);
      if (!operation.ok) invalid = adapterFailure(operation.code);
      else if (
        typeof apiKey !== 'string' ||
        !apiKey.trim() ||
        apiKey.length > 4096 ||
        /[\r\n]/.test(apiKey) ||
        request.model !== operation.definition.models[provider] ||
        JSON.stringify(request.outputJsonSchema) !==
          JSON.stringify(operation.definition.outputJsonSchema) ||
        typeof request.prompt !== 'string' ||
        !request.prompt ||
        request.prompt.length > 4096
      )
        invalid = adapterFailure('configuration_error');
      else if (!probeInputSchema.safeParse(request.input).success)
        invalid = adapterFailure('invalid_request');
      else if (
        !Number.isSafeInteger(request.limits.completionTokens) ||
        request.limits.completionTokens < 1 ||
        request.limits.completionTokens > 1024
      )
        invalid = adapterFailure('configuration_error');
      else {
        preparedRequest = {
          ...request,
          input: { ...request.input },
          limits: { ...request.limits },
        };
        body = JSON.stringify(encode(preparedRequest));
        limits = {
          requestBytes: request.limits.requestBytes,
          responseBytes: request.limits.responseBytes,
        };
        if (
          Buffer.byteLength(body, 'utf8') > Math.min(limits.requestBytes, 16384)
        )
          invalid = adapterFailure('invalid_request');
      }
    } catch {
      invalid = adapterFailure('configuration_error');
    }
    // No tokenizer or reviewed conservative framing bound is installed. Bytes are
    // not token counts; staging/production core admission therefore fails closed.
    return Object.freeze({
      inputTokenUpperBound: null,
      async send(attemptSignal: AbortSignal): Promise<AdapterResult> {
        const combined = AbortSignal.any([
          signal,
          attemptSignal,
          shutdown.signal,
        ]);
        if (combined.aborted) return adapterFailure('cancelled');
        if (invalid) return invalid;
        try {
          const result = await abortable(
            () => transport.send({ body, apiKey, signal: combined, limits }),
            combined,
          );
          if (combined.aborted) return adapterFailure('cancelled');
          if (!result.ok)
            return {
              status: 'failure',
              code: result.code,
              retryable: result.retryable,
              internalRetry: result.internalRetry,
            };
          let parsed: unknown;
          try {
            parsed = JSON.parse(result.body);
          } catch {
            parsed = null;
          }
          const httpFailure = classifyProviderHttp(
            provider,
            result.status,
            parsed,
            result.retryAfter,
          );
          if (httpFailure) return httpFailure;
          if (
            !result.contentType ||
            !/^application\/json(?:\s*;|\s*$)/i.test(result.contentType)
          )
            return adapterFailure('invalid_output');
          if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
            return adapterFailure('invalid_output');
          const decoded = decode(providerRecord(parsed), preparedRequest);
          if (combined.aborted) return adapterFailure('cancelled');
          if (decoded.status === 'complete') {
            let output: unknown;
            try {
              output = JSON.parse(decoded.text);
            } catch {
              return {
                ...adapterFailure('invalid_output'),
                usage: decoded.usage,
                reportedModel: decoded.reportedModel,
              };
            }
            if (!probeOutputSchema.safeParse(output).success)
              return {
                ...adapterFailure('invalid_output'),
                usage: decoded.usage,
                reportedModel: decoded.reportedModel,
              };
          }
          return decoded;
        } catch {
          return combined.aborted
            ? adapterFailure('cancelled')
            : adapterFailure('provider_unavailable', true);
        }
      },
    });
  }
  return Object.freeze({
    provider,
    prepare,
    async send(request: AdapterRequest, signal: AbortSignal) {
      return (await prepare(request, signal)).send(signal);
    },
    async close() {
      shutdown.abort();
      await transport.close();
    },
    destroy() {
      shutdown.abort();
      transport.destroy();
    },
  });
}
