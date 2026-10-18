import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { getRuntime, type RuntimeRegistry } from './runtime';
export type RequestContext = Readonly<{ requestId: string; startedAt: number }>;
export function createRequestScope() {
  const storage = new AsyncLocalStorage<{
    context: RequestContext;
    active: boolean;
  }>();
  return {
    current(): RequestContext | undefined {
      const slot = storage.getStore();
      return slot?.active ? slot.context : undefined;
    },
    async run<T>(work: () => Promise<T>, signal?: AbortSignal): Promise<T> {
      const slot = {
        context: Object.freeze({
          requestId: randomUUID(),
          startedAt: performance.now(),
        }),
        active: !signal?.aborted,
      };
      const clear = () => {
        slot.active = false;
      };
      signal?.addEventListener('abort', clear, { once: true });
      try {
        return await storage.run(slot, work);
      } finally {
        clear();
        signal?.removeEventListener('abort', clear);
      }
    },
    async close() {
      storage.disable();
    },
    destroy() {
      storage.disable();
    },
  };
}
const scopeKey = Symbol.for('dsa-interview.foundation.request-scope.v1');
export function runtimeRequestScope(runtime: RuntimeRegistry = getRuntime()) {
  return runtime.getOrCreate(scopeKey, createRequestScope);
}
