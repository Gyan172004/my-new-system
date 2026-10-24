import { z } from 'zod';
import type {
  TransactionDatabase,
  TransactionScope,
} from '../../../server/transaction';
import { createUserRepository } from '../persistence/users';
export function createActiveUserLookup(db: TransactionDatabase) {
  const users = createUserRepository(db);
  return async (
    userId: string,
    scope?: TransactionScope,
    signal?: AbortSignal,
  ): Promise<Readonly<{ userId: string }> | null> => {
    if (!z.uuid().safeParse(userId).success) return null;
    return users.lookupActive(userId, scope, signal);
  };
}
