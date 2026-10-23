import type {
  TransactionDatabase,
  TransactionScope,
} from '../../../server/transaction';
import { createCatalogueReadRepository } from '../persistence/reads';
import { requireCatalogueId } from './read';
export function createCatalogueResolver(db: TransactionDatabase) {
  const repository = createCatalogueReadRepository(db);
  return Object.freeze({
    async resolveForNewSession(problemId: string, scope: TransactionScope) {
      requireCatalogueId(problemId);
      return repository.resolve(problemId, scope);
    },
  });
}
