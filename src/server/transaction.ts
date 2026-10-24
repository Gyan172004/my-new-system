import type { PoolClient } from 'pg';
import { AsyncLocalStorage } from 'node:async_hooks';
const activeTransaction = new AsyncLocalStorage<boolean>();

export interface TransactionDatabase {
  withClient<T>(
    work: (client: PoolClient) => Promise<T>,
    signal?: AbortSignal,
  ): Promise<T>;
}
declare const scopeBrand: unique symbol;
export type TransactionScope = Readonly<{ [scopeBrand]: true }>;
const scopes = new WeakMap<
  TransactionScope,
  { db: TransactionDatabase; client: PoolClient }
>();
const aborts = new WeakMap<object, { code: string; path?: string }>();
export class TransactionDomainFailure extends Error {
  constructor(
    readonly code: string,
    readonly path?: string,
  ) {
    super(code);
    this.name = 'TransactionDomainFailure';
  }
}
export function abortTransaction(code: string, path?: string): never {
  if (
    !/^[a-z][a-z0-9_]{0,63}$/.test(code) ||
    (path !== undefined && !/^[a-zA-Z0-9_.[\]-]{1,256}$/.test(path))
  )
    throw Error('invalid_transaction_failure');
  const marker = Object.freeze({});
  aborts.set(marker, { code, ...(path === undefined ? {} : { path }) });
  throw marker;
}
/** Internal repository capability. Public services never expose a client or scope. */
export function repositoryClient(
  scope: TransactionScope,
  db: TransactionDatabase,
): PoolClient {
  const state = scopes.get(scope);
  if (!state || state.db !== db) throw Error('invalid_transaction_scope');
  return state.client;
}
export function createTransactionRunner(db: TransactionDatabase) {
  return Object.freeze({
    async run<T>(
      work: (scope: TransactionScope) => Promise<T>,
      signal?: AbortSignal,
    ): Promise<T> {
      if (activeTransaction.getStore()) throw Error('nested_transaction');
      let scope: TransactionScope | undefined;
      try {
        const outcome = await db.withClient(async (client) => {
          await client.query('BEGIN');
          scope = Object.freeze({}) as TransactionScope;
          scopes.set(scope, { db, client });
          try {
            const value = await activeTransaction.run(true, () => work(scope!));
            await client.query('COMMIT');
            return { ok: true as const, value };
          } catch (error) {
            await client.query('ROLLBACK');
            const failure =
              typeof error === 'object' && error !== null
                ? aborts.get(error)
                : undefined;
            if (failure) return { ok: false as const, failure };
            throw error;
          } finally {
            scopes.delete(scope);
          }
        }, signal);
        if (!outcome.ok)
          throw new TransactionDomainFailure(
            outcome.failure.code,
            outcome.failure.path,
          );
        return outcome.value;
      } finally {
        if (scope) scopes.delete(scope);
      }
    },
  });
}
