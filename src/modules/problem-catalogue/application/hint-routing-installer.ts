import type { TransactionDatabase } from '../../../server/transaction';
import { createHintRoutingRepository } from '../persistence/hint-routing';

/** Trusted installation joins the content-publishing owner's transaction. */
export function createHintRoutingInstaller(db: TransactionDatabase) {
  const repository = createHintRoutingRepository(db);
  return Object.freeze({ install: repository.install });
}
