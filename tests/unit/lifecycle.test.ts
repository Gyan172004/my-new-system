import { afterEach, describe, expect, it, vi } from 'vitest';
import { Application, type ServerAdapter } from '../../src/server/bootstrap';
import { createRuntime } from '../../src/server/runtime';

const settings = {
  APP_ENV: 'test',
  DATABASE_URL: 'postgresql://localhost/foundation',
};
function fixture(overrides: Partial<ServerAdapter> = {}) {
  const events: string[] = [];
  let admitted = false;
  const adapter: ServerAdapter = {
    async prepare() {
      events.push('prepare');
    },
    async listen(signal) {
      signal.throwIfAborted();
      admitted = true;
      events.push('listen');
    },
    async stopAdmission() {
      admitted = false;
      events.push('drain');
    },
    async close() {
      events.push('close');
    },
    forceClose() {
      admitted = false;
      events.push('force');
    },
    ...overrides,
  };
  let factories = 0;
  const app = new Application(settings, {
    createAdapter: () => {
      factories++;
      return adapter;
    },
    installRuntime: createRuntime,
  });
  return {
    app,
    adapter,
    events,
    isAdmitted: () => admitted,
    factoryCount: () => factories,
  };
}
afterEach(() => vi.useRealTimers());

describe('application lifecycle', () => {
  it('validates before creating an adapter or opening admission', async () => {
    let created = false;
    const app = new Application(
      {},
      {
        createAdapter: () => {
          created = true;
          throw new Error('unexpected');
        },
        installRuntime: createRuntime,
      },
    );
    await expect(app.start()).rejects.toThrow('APP_ENV');
    expect(created).toBe(false);
    expect(app.state).toBe('FAILED');
  });
  it('prepares before listening and drains before closing', async () => {
    const f = fixture();
    await f.app.start();
    expect(f.app.state).toBe('SERVING');
    expect(f.isAdmitted()).toBe(true);
    const stopped = f.app.stop();
    expect(f.app.state).toBe('DRAINING');
    expect(f.isAdmitted()).toBe(false);
    await stopped;
    expect(f.app.state).toBe('STOPPED');
    expect(f.events).toEqual(['prepare', 'listen', 'drain', 'close']);
  });
  it('makes repeated start and stop safe without duplicate listeners/resources', async () => {
    const f = fixture();
    await Promise.all([f.app.start(), f.app.start()]);
    await Promise.all([f.app.stop(), f.app.stop()]);
    await f.app.stop();
    expect(f.factoryCount()).toBe(1);
    expect(f.events).toEqual(['prepare', 'listen', 'drain', 'close']);
  });
  it('cleans resources on preparation failure without leaking dependency text', async () => {
    const f = fixture({
      prepare: async () => {
        throw new Error('CANARY_PRIVATE_EXCEPTION');
      },
    });
    await expect(f.app.start()).rejects.toThrow('startup_failed');
    expect(f.isAdmitted()).toBe(false);
    expect(f.events).toEqual(['drain', 'close']);
    expect(f.app.state).toBe('FAILED');
  });
  it('cleans the prepared adapter on listener failure', async () => {
    const f = fixture({
      listen: async () => {
        throw new Error('CANARY_ADDRESS');
      },
    });
    await expect(f.app.start()).rejects.toThrow('startup_failed');
    expect(f.events).toEqual(['prepare', 'drain', 'close']);
    expect(f.app.state).toBe('FAILED');
  });
  it('bounds stuck preparation and prevents its late continuation from listening', async () => {
    vi.useFakeTimers();
    let release!: () => void;
    const f = fixture({
      prepare: () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    });
    const app = new Application(
      { ...settings, STARTUP_TIMEOUT_MS: '50' },
      { createAdapter: () => f.adapter, installRuntime: createRuntime },
    );
    const result = app.start().catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(50);
    expect(String(await result)).toContain('startup_deadline');
    release();
    await vi.advanceTimersByTimeAsync(1);
    expect(f.isAdmitted()).toBe(false);
    expect(f.events).toContain('force');
    expect(app.state).toBe('FAILED');
  });
  it('forces shutdown at the total deadline rather than waiting on stuck drain', async () => {
    vi.useFakeTimers();
    const f = fixture({ stopAdmission: () => new Promise<void>(() => {}) });
    const app = new Application(
      { ...settings, SHUTDOWN_TIMEOUT_MS: '40' },
      { createAdapter: () => f.adapter, installRuntime: createRuntime },
    );
    await app.start();
    const result = app.stop().catch((error: unknown) => error);
    expect(app.state).toBe('DRAINING');
    await vi.advanceTimersByTimeAsync(40);
    expect(String(await result)).toContain('shutdown_deadline');
    expect(f.events).toContain('force');
    expect(f.isAdmitted()).toBe(false);
  });
  it('bounds adapter close using the same shutdown deadline', async () => {
    vi.useFakeTimers();
    const f = fixture({ close: () => new Promise<void>(() => {}) });
    const app = new Application(
      { ...settings, SHUTDOWN_TIMEOUT_MS: '40' },
      { createAdapter: () => f.adapter, installRuntime: createRuntime },
    );
    await app.start();
    const result = app.stop().catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(40);
    expect(String(await result)).toContain('shutdown_deadline');
    expect(f.events).toContain('force');
  });
  it('does not bind after stop interrupts preparation', async () => {
    let release!: () => void;
    const f = fixture({
      prepare: () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    });
    const result = f.app.start().catch((error: unknown) => error);
    await f.app.stop();
    release();
    expect(String(await result)).toContain('startup_cancelled');
    expect(f.isAdmitted()).toBe(false);
    expect(f.app.state).toBe('STOPPED');
  });
  it('destroys acquired resources when their close never finishes', async () => {
    vi.useFakeTimers();
    const f = fixture();
    const app = new Application(
      { ...settings, SHUTDOWN_TIMEOUT_MS: '40' },
      { createAdapter: () => f.adapter, installRuntime: createRuntime },
    );
    await app.start();
    let destroyed = false;
    app.runtime!.getOrCreate(Symbol(), () => ({
      close: () => new Promise<void>(() => {}),
      destroy: () => {
        destroyed = true;
      },
    }));
    const result = app.stop().catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(40);
    expect(String(await result)).toContain('shutdown_deadline');
    expect(destroyed).toBe(true);
  });
  it('keeps resources lazy and closes an acquired resource once', async () => {
    const f = fixture();
    await f.app.start();
    const runtime = f.app.runtime!;
    let acquisitions = 0;
    let closed = 0;
    const key = Symbol('owned fixture');
    const acquire = () => {
      acquisitions++;
      return {
        close: async () => {
          closed++;
        },
        destroy: () => {},
      };
    };
    expect(acquisitions).toBe(0);
    expect(runtime.getOrCreate(key, acquire)).toBe(
      runtime.getOrCreate(key, acquire),
    );
    expect(acquisitions).toBe(1);
    await f.app.stop();
    expect(closed).toBe(1);
    expect(() => runtime.getOrCreate(Symbol(), acquire)).toThrow(
      'runtime_draining',
    );
  });
});

it('refuses to restart a stopped application instance', async () => {
  const f = fixture();
  await f.app.start();
  await f.app.stop();
  await expect(f.app.start()).rejects.toThrow('lifecycle_stopped');
  expect(f.isAdmitted()).toBe(false);
});

it('rejects lifecycle resurrection through the shared registry', async () => {
  const f = fixture();
  await f.app.start();
  await f.app.stop();
  expect(() => {
    f.app.runtime!.state = 'SERVING';
  }).toThrow('invalid_lifecycle_transition');
  expect(f.app.state).toBe('STOPPED');
});

it('makes stop after startup failure idempotent without closing ownership twice', async () => {
  const f = fixture({
    prepare: async () => {
      throw new Error('private_dependency_failure');
    },
  });
  await expect(f.app.start()).rejects.toThrow('startup_failed');
  await expect(f.app.stop()).resolves.toBeUndefined();
  await f.app.stop();
  expect(f.events).toEqual(['drain', 'close']);
  expect(f.app.state).toBe('FAILED');
});

it('still closes runtime resources when adapter close throws synchronously', async () => {
  const f = fixture({
    close: () => {
      throw new Error('private_close_failure');
    },
  });
  await f.app.start();
  let closed = false;
  f.app.runtime!.getOrCreate(Symbol(), () => ({
    close: async () => {
      closed = true;
    },
    destroy: () => {},
  }));
  await expect(f.app.stop()).rejects.toThrow('shutdown_failed');
  expect(closed).toBe(true);
  expect(f.events).toContain('force');
  expect(f.app.state).toBe('FAILED');
});

it('keeps the hard deadline and destroys resources even when adapter force cleanup throws', async () => {
  vi.useFakeTimers();
  const f = fixture({
    stopAdmission: () => new Promise<void>(() => {}),
    forceClose: () => {
      throw new Error('private_force_failure');
    },
  });
  const app = new Application(
    { ...settings, SHUTDOWN_TIMEOUT_MS: '40' },
    { createAdapter: () => f.adapter, installRuntime: createRuntime },
  );
  await app.start();
  let destroyed = false;
  app.runtime!.getOrCreate(Symbol(), () => ({
    close: async () => {},
    destroy: () => {
      destroyed = true;
    },
  }));
  const result = app.stop().catch((error: unknown) => error);
  await vi.advanceTimersByTimeAsync(40);
  expect(String(await result)).toContain('shutdown_deadline');
  expect(destroyed).toBe(true);
});
