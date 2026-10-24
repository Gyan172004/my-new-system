import { randomUUID } from 'node:crypto';
import type { createDatabase } from '../../../server/database';
import {
  repositoryClient,
  type TransactionScope,
} from '../../../server/transaction';
import type { StoredIdentity, VerifiedIdentity } from '../application/types';
export function createUserRepository(
  db: Pick<ReturnType<typeof createDatabase>, 'withClient'>,
) {
  return {
    async lookupActive(
      userId: string,
      scope?: TransactionScope,
      signal?: AbortSignal,
    ) {
      const query = async (client: import('pg').PoolClient) => {
        const result = await client.query<{ id: string }>(
          "SELECT id FROM users WHERE id=$1 AND account_status='active'",
          [userId],
        );
        return result.rows[0]
          ? Object.freeze({ userId: result.rows[0].id })
          : null;
      };
      if (signal?.aborted) throw Error('database_unavailable');
      return scope
        ? query(repositoryClient(scope, db))
        : db.withClient(query, signal);
    },
    async resolve(
      identity: VerifiedIdentity,
      signal?: AbortSignal,
    ): Promise<StoredIdentity> {
      return db.withClient(async (client) => {
        const params = [identity.provider, identity.issuer, identity.subject];
        await client.query(
          'INSERT INTO users (id,identity_provider,identity_issuer,identity_subject) VALUES ($1,$2,$3,$4) ON CONFLICT (identity_provider,identity_issuer,identity_subject) DO NOTHING',
          [randomUUID(), ...params],
        );
        // A fresh READ COMMITTED statement sees the winner of a concurrent insert.
        const result = await client.query<{
          id: string;
          status: 'active' | 'disabled';
        }>(
          'SELECT id,account_status AS status FROM users WHERE identity_provider=$1 AND identity_issuer=$2 AND identity_subject=$3',
          params,
        );
        if (!result.rows[0]) throw new Error('identity_mapping_unavailable');
        return Object.freeze(result.rows[0]);
      }, signal);
    },
  };
}
