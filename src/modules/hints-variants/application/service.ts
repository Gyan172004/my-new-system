import type { TransactionDatabase } from '../../../server/transaction';
import { createExposureRepository } from '../persistence/exposures';
export function createExposureStore(db:TransactionDatabase){return Object.freeze(createExposureRepository(db));}
