import { expect, it } from 'vitest';
import type { PoolClient } from 'pg';
import {
  abortTransaction,
  createTransactionRunner,
  repositoryClient,
} from '../../../src/server/transaction';

// The adapter double models withClient's intentional sanitization boundary.
function database(fail?: string) {
  const statements: string[] = [];
  const client = {
    async query(sql: string) {
      statements.push(sql);
      if (sql === fail) throw Error('driver-secret');
      return { rows: [] };
    },
  } as unknown as PoolClient;
  return {
    statements,
    client,
    async withClient<T>(work: (c: PoolClient) => Promise<T>) {
      try {
        return await work(client);
      } catch {
        throw Error('database_unavailable');
      }
    },
  };
}
it('commits work on its one connection and expires the capability', async () => {
  const db = database();
  const runner = createTransactionRunner(db);
  let captured: unknown;
  expect(
    await runner.run(async (scope) => {
      captured = scope;
      expect(repositoryClient(scope, db)).toBe(db.client);
      return 7;
    }),
  ).toBe(7);
  expect(db.statements).toEqual(['BEGIN', 'COMMIT']);
  expect(() => repositoryClient(captured as never, db)).toThrow(
    'invalid_transaction_scope',
  );
  expect(() => repositoryClient({} as never, db)).toThrow(
    'invalid_transaction_scope',
  );
});
it('rolls back known failures and preserves only safe domain fields outside withClient', async () => {
  const db = database();
  await expect(
    createTransactionRunner(db).run(async () =>
      abortTransaction('version_conflict', 'version'),
    ),
  ).rejects.toMatchObject({ code: 'version_conflict', path: 'version' });
  expect(db.statements).toEqual(['BEGIN', 'ROLLBACK']);
});
it.each(['BEGIN', 'COMMIT', 'ROLLBACK'])(
  'sanitizes %s failures',
  async (fail) => {
    const db = database(fail);
    await expect(
      createTransactionRunner(db).run(async () => {
        if (fail === 'ROLLBACK') abortTransaction('conflict');
      }),
    ).rejects.toThrow('database_unavailable');
  },
);
it('rejects foreign scopes and unknown callback errors without leaking details', async () => {
  const db = database();
  const other = database();
  await expect(
    createTransactionRunner(db).run(async (scope) =>
      repositoryClient(scope, other),
    ),
  ).rejects.toThrow('database_unavailable');
  await expect(
    createTransactionRunner(db).run(async () => {
      throw Error('secret');
    }),
  ).rejects.toThrow('database_unavailable');
});
it('rejects a nested transaction before opening another connection', async () => {
  const db = database();
  const runner = createTransactionRunner(db);
  await expect(
    runner.run(async () => runner.run(async () => 1)),
  ).rejects.toThrow('database_unavailable');
  expect(db.statements).toEqual(['BEGIN', 'ROLLBACK']);
});
