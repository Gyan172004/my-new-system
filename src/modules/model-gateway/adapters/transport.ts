import { abortable, safely } from '../application/budgets';
import type { GatewayErrorCode } from '../application/types';
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
