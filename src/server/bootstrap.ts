import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http';
import type { Socket } from 'node:net';
import { pathToFileURL } from 'node:url';
import {
  ConfigurationError,
  parseRuntimeConfig,
  type RuntimeConfig,
} from './config';
import { createHttpHandler } from './http';
import { runtimeRequestScope } from './request-context';
import { runtimeLogger } from './logger';
import {
  createRuntime,
  installRuntime,
  type LifecycleState,
  type RuntimeRegistry,
} from './runtime';

export interface ServerAdapter {
  prepare(signal: AbortSignal): Promise<void>;
  listen(signal: AbortSignal): Promise<void>;
  stopAdmission(): Promise<void>;
  close(): Promise<void>;
  forceClose(): void;
}
export interface ApplicationDependencies {
  createAdapter(config: RuntimeConfig, runtime: RuntimeRegistry): ServerAdapter;
  installRuntime(config: RuntimeConfig): RuntimeRegistry;
}
class LifecycleError extends Error {}

async function withinDeadline(
  work: Promise<void>,
  milliseconds: number,
  code: string,
  force: () => void,
): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      work,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () => {
            force();
            reject(new LifecycleError(code));
          },
          Math.max(0, milliseconds),
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export class Application {
  #initialState: LifecycleState = 'NEW';
  #runtime: RuntimeRegistry | undefined;
  #adapter: ServerAdapter | undefined;
  #start: Promise<void> | undefined;
  #stop: Promise<void> | undefined;
  readonly #abort = new AbortController();
  constructor(
    readonly raw: Readonly<Record<string, string | undefined>>,
    readonly dependencies: ApplicationDependencies,
  ) {}
  get runtime() {
    return this.#runtime;
  }
  get state(): LifecycleState {
    return this.#runtime?.state ?? this.#initialState;
  }
  #setState(state: LifecycleState) {
    this.#initialState = state;
    if (this.#runtime) this.#runtime.state = state;
  }
  start(): Promise<void> {
    if (['DRAINING', 'STOPPED', 'FAILED'].includes(this.state))
      return Promise.reject(new LifecycleError('lifecycle_stopped'));
    return (this.#start ??= this.#initialize());
  }
  async #initialize(): Promise<void> {
    this.#setState('VALIDATING');
    let config: RuntimeConfig;
    try {
      config = parseRuntimeConfig(this.raw);
      this.#runtime = this.dependencies.installRuntime(config);
    } catch (error) {
      this.#setState('FAILED');
      throw error instanceof ConfigurationError
        ? error
        : new LifecycleError('startup_failed');
    }
    this.#setState('VALIDATING');
    this.#setState('INITIALIZING');
    const started = performance.now();
    try {
      this.#adapter = this.dependencies.createAdapter(config, this.#runtime!);
      const initialize = async () => {
        await this.#adapter!.prepare(this.#abort.signal);
        this.#abort.signal.throwIfAborted();
        await this.#adapter!.listen(this.#abort.signal);
        this.#abort.signal.throwIfAborted();
        this.#setState('SERVING');
      };
      await withinDeadline(
        initialize(),
        config.startupTimeoutMs,
        'startup_deadline',
        () => {
          this.#abort.abort(new LifecycleError('startup_deadline'));
          this.#forceClose();
        },
      );
    } catch (error) {
      if (this.#stop) {
        await this.#stop;
        throw new LifecycleError('startup_cancelled');
      }
      this.#setState('FAILED');
      this.#abort.abort(new LifecycleError('startup_failed'));
      const remaining = config.startupTimeoutMs - (performance.now() - started);
      if (remaining > 0) {
        try {
          this.#stop = this.#cleanup(
            Math.min(remaining, config.shutdownTimeoutMs),
          );
          await this.#stop;
        } catch {
          this.#forceClose();
        }
      } else {
        this.#forceClose();
        this.#stop = Promise.resolve();
      }
      throw new LifecycleError(
        error instanceof LifecycleError && error.message === 'startup_deadline'
          ? 'startup_deadline'
          : 'startup_failed',
      );
    }
  }
  stop(): Promise<void> {
    if (this.#stop) return this.#stop;
    if (!this.#runtime) {
      this.#setState('STOPPED');
      return (this.#stop = Promise.resolve());
    }
    this.#setState('DRAINING');
    this.#abort.abort(new LifecycleError('startup_cancelled'));
    return (this.#stop = this.#cleanup(
      this.#runtime.config.shutdownTimeoutMs,
    ).then(
      () => {
        this.#setState('STOPPED');
      },
      (error: unknown) => {
        this.#forceClose();
        this.#setState('FAILED');
        throw new LifecycleError(
          error instanceof LifecycleError &&
            error.message === 'shutdown_deadline'
            ? 'shutdown_deadline'
            : 'shutdown_failed',
        );
      },
    ));
  }
  #forceClose() {
    try {
      this.#adapter?.forceClose();
    } catch {
      // A failing closer must not interrupt forced cleanup or the deadline.
    } finally {
      this.#runtime?.destroyResources();
    }
  }
  #cleanup(milliseconds: number): Promise<void> {
    const close = async () => {
      let failed = false;
      try {
        await this.#adapter?.stopAdmission();
      } catch {
        failed = true;
      }
      const closed = await Promise.allSettled([
        Promise.resolve().then(() => this.#adapter?.close()),
        Promise.resolve().then(() => this.#runtime?.closeResources()),
      ]);
      if (failed || closed.some((result) => result.status === 'rejected'))
        throw new LifecycleError('shutdown_failed');
    };
    return withinDeadline(close(), milliseconds, 'shutdown_deadline', () =>
      this.#forceClose(),
    );
  }
}

interface NextAdapter {
  prepare(): Promise<void>;
  getRequestHandler(): (
    request: IncomingMessage,
    response: ServerResponse,
  ) => Promise<void>;
  close(): Promise<void>;
}
type NextFactory = (
  options: Parameters<(typeof import('next'))['default']>[0],
) => NextAdapter;
export function nodeAdapter(
  config: RuntimeConfig,
  loadNext: () => Promise<NextFactory> = async () =>
    (await import('next')).default,
  registry: RuntimeRegistry = createRuntime(config),
): ServerAdapter {
  let app: NextAdapter | undefined;
  let handle:
    | ((request: IncomingMessage, response: ServerResponse) => Promise<void>)
    | undefined;
  let draining = false;
  const sockets = new Set<Socket>();
  const server = createServer(
    createHttpHandler(
      async (request, response) => {
        if (!handle) throw new LifecycleError('not_initialized');
        await handle(request, response);
      },
      {
        scope: runtimeRequestScope(registry),
        logger: runtimeLogger(registry),
        isDraining: () => draining,
      },
    ),
  );
  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.once('close', () => sockets.delete(socket));
  });
  return {
    async prepare(signal) {
      const next = await loadNext();
      signal.throwIfAborted();
      app = next({
        dev: process.env.NODE_ENV !== 'production',
        dir: process.cwd(),
        port: config.port,
        hostname: '0.0.0.0',
        httpServer: server,
        quiet: true,
        turbopack: true,
      });
      await app.prepare();
      signal.throwIfAborted();
      handle = app.getRequestHandler();
    },
    listen(signal) {
      return new Promise<void>((resolve, reject) => {
        signal.throwIfAborted();
        const onError = () => {
          server.off('listening', onListening);
          reject(new LifecycleError('listen_failed'));
        };
        const onListening = () => {
          server.off('error', onError);
          resolve();
        };
        server.once('error', onError);
        server.once('listening', onListening);
        server.listen({ port: config.port, host: '0.0.0.0', signal });
      });
    },
    stopAdmission() {
      draining = true;
      return new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (
            error &&
            (!('code' in error) || error.code !== 'ERR_SERVER_NOT_RUNNING')
          )
            reject(new LifecycleError('drain_failed'));
          else resolve();
        });
      });
    },
    async close() {
      await app?.close();
    },
    forceClose() {
      draining = true;
      server.closeAllConnections();
      for (const socket of sockets) socket.destroy();
    },
  };
}

async function main() {
  const application = new Application(process.env, {
    createAdapter: (config, registry) =>
      nodeAdapter(config, undefined, registry),
    installRuntime,
  });
  let stopping = false;
  const stop = () => {
    if (stopping) return;
    stopping = true;
    void application.stop().then(
      () => process.exit(0),
      () => {
        process.stderr.write('shutdown_failed\n');
        process.exit(1);
      },
    );
  };
  process.once('SIGTERM', stop);
  process.once('SIGINT', stop);
  try {
    await application.start();
    runtimeLogger(application.runtime!).write('application_started');
  } catch (error) {
    if (!stopping) {
      process.stderr.write(
        `${error instanceof ConfigurationError || error instanceof LifecycleError ? error.message : 'startup_failed'}\n`,
      );
      process.exit(1);
    }
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  void main();
