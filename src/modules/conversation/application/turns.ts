import type { TransactionDatabase } from '../../../server/transaction';
import { createTurnRepository } from '../persistence/turns';
export function createConversationStore(db:TransactionDatabase){return Object.freeze(createTurnRepository(db));}
