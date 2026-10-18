import { databaseConnectionOptions } from './database-options';
import { Pool, type PoolClient } from 'pg';
import type { RuntimeConfig } from './config';
import { getRuntime, type RuntimeRegistry } from './runtime';
import { createSafeLogger, runtimeLogger } from './logger';
import { readSchemaHistory } from './schema-version';
export function createDatabase(
  config: RuntimeConfig,
  logger: Pick<ReturnType<typeof createSafeLogger>, 'write'> = createSafeLogger(
    config,
  ),
) {
  let pool: Pool | undefined;
  let stopped = false;
  let closing: Promise<void> | undefined;
  const controllers = new Set<AbortController>();
  const active = new Map<PoolClient, (destroy: boolean) => void>();
  const unavailable = () => new Error('database_unavailable');
  const getPool = () => {
    if (stopped) throw unavailable();
    if (!pool) {
      pool = new Pool({
        ...databaseConnectionOptions(config.databaseUrl),
        max: config.poolMax,
        connectionTimeoutMillis: config.connectTimeoutMs,
        statement_timeout: config.statementTimeoutMs,
        query_timeout: config.statementTimeoutMs,
        application_name: 'foundation_runtime',
        options: `-c statement_timeout=${config.statementTimeoutMs}`,
        idleTimeoutMillis: 10000,
      });
      pool.on('error', () =>
        logger.write('database_error', { code: 'database_unavailable' }),
      );
    }
    return pool;
  };
  const withClient = async <T>(
    work: (client: PoolClient) => Promise<T>,
    external?: AbortSignal,
  ): Promise<T> => {
    if (stopped || external?.aborted) throw unavailable();
    const controller = new AbortController();
    controllers.add(controller);
    const abort = () => controller.abort();
    external?.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(abort, config.readinessTimeoutMs);
    let client: PoolClient | undefined;
    let failed = false;
    let rejectAbort!: (error: Error) => void;
    const onAbort = () => {
      if (client) active.get(client)?.(true);
      rejectAbort(unavailable());
    };
    const cancelled = new Promise<never>((_resolve, reject) => {
      rejectAbort = reject;
    });
    controller.signal.addEventListener('abort', onAbort, { once: true });
    try {
      const operation = (async () => {
        const acquired = await getPool().connect();
        if (controller.signal.aborted || stopped) {
          acquired.release(true);
          throw unavailable();
        }
        client = acquired;
        let released = false;
        const onError = () => controller.abort();
        client.on('error', onError);
        active.set(client, (destroy) => {
          if (released) return;
          released = true;
          active.delete(acquired);
          acquired.off('error', onError);
          acquired.release(destroy);
        });
        const result = await work(client);
        controller.signal.throwIfAborted();
        return result;
      })();
      return await Promise.race([operation, cancelled]);
    } catch {
      failed = true;
      throw unavailable();
    } finally {
      clearTimeout(timer);
      external?.removeEventListener('abort', abort);
      controller.signal.removeEventListener('abort', onAbort);
      controllers.delete(controller);
      if (client) active.get(client)?.(failed || controller.signal.aborted);
    }
  };
  const end = () => {
    stopped = true;
    for (const controller of controllers) controller.abort();
    for (const release of [...active.values()]) release(true);
    closing ??= pool?.end() ?? Promise.resolve();
    return closing;
  };
  return {
    withClient,
    observe(signal: AbortSignal) {
      return withClient(
        async (client) => ({ revisions: await readSchemaHistory(client) }),
        signal,
      );
    },
    close: end,
    destroy() {
      void end().catch(() => {});
    },
  };
}
const databaseKey = Symbol.for('dsa-interview.foundation.database.v1');
export function runtimeDatabase(runtime: RuntimeRegistry = getRuntime()) {
  return runtime.getOrCreate(databaseKey, () =>
    createDatabase(runtime.config, runtimeLogger(runtime)),
  );
}
