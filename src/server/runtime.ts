import type { RuntimeConfig } from './config';

export type LifecycleState =
  | 'NEW'
  | 'VALIDATING'
  | 'INITIALIZING'
  | 'SERVING'
  | 'DRAINING'
  | 'STOPPED'
  | 'FAILED';
export interface OwnedResource {
  close(): Promise<void>;
  destroy(): void;
}

export class RuntimeRegistry {
  #state: LifecycleState = 'NEW';
  get state() {
    return this.#state;
  }
  set state(next: LifecycleState) {
    if (next === this.#state) return;
    const allowed: Record<LifecycleState, readonly LifecycleState[]> = {
      NEW: ['VALIDATING', 'STOPPED', 'FAILED'],
      VALIDATING: ['INITIALIZING', 'DRAINING', 'FAILED'],
      INITIALIZING: ['SERVING', 'DRAINING', 'FAILED'],
      SERVING: ['DRAINING', 'FAILED'],
      DRAINING: ['STOPPED', 'FAILED'],
      STOPPED: [],
      FAILED: [],
    };
    if (!allowed[this.#state].includes(next))
      throw new Error('invalid_lifecycle_transition');
    this.#state = next;
  }
  readonly #resources = new Map<symbol, OwnedResource>();
  #closing: Promise<void> | undefined;
  constructor(readonly config: RuntimeConfig) {}

  getOrCreate<T extends OwnedResource>(key: symbol, factory: () => T): T {
    if (['DRAINING', 'STOPPED', 'FAILED'].includes(this.state))
      throw new Error('runtime_draining');
    let resource = this.#resources.get(key);
    if (!resource) {
      resource = factory();
      this.#resources.set(key, resource);
    }
    return resource as T;
  }
  closeResources(): Promise<void> {
    this.#closing ??= Promise.allSettled(
      [...this.#resources.values()].map((resource) =>
        Promise.resolve().then(() => resource.close()),
      ),
    ).then((results) => {
      if (results.some((result) => result.status === 'rejected'))
        throw new Error('resource_close_failed');
    });
    return this.#closing;
  }
  destroyResources(): void {
    for (const resource of this.#resources.values()) {
      try {
        resource.destroy();
      } catch {
        /* Continue forcing every owned resource. */
      }
    }
  }
}
export function createRuntime(config: RuntimeConfig) {
  return new RuntimeRegistry(config);
}

// Both the custom entrypoint and the Next Node bundle address this process slot.
const runtimeKey = Symbol.for('dsa-interview.foundation.runtime.v1');
type GlobalRegistry = typeof globalThis & { [runtimeKey]?: RuntimeRegistry };
export function installRuntime(config: RuntimeConfig): RuntimeRegistry {
  const root = globalThis as GlobalRegistry;
  if (root[runtimeKey]) throw new Error('runtime_already_installed');
  return (root[runtimeKey] = createRuntime(config));
}
export function getRuntime(): RuntimeRegistry {
  const runtime = (globalThis as GlobalRegistry)[runtimeKey];
  if (!runtime) throw new Error('runtime_unavailable');
  return runtime;
}
