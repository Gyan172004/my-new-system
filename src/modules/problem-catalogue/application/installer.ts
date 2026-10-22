import type { TransactionDatabase } from '../../../server/transaction';
import { createReleaseRepository } from '../persistence/releases';
/** Narrow trusted installation boundary; content reads remain with owning services. */
export function createCatalogueInstaller(db: TransactionDatabase) {
  const { install, lockProblem, findRelease, selectCurrent, setAvailability } =
    createReleaseRepository(db);
  return Object.freeze({
    install,
    lockProblem,
    findRelease,
    selectCurrent,
    setAvailability,
  });
}
