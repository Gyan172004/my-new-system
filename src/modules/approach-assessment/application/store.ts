import type { TransactionDatabase } from '../../../server/transaction';
import { createAssessmentRepository } from '../persistence/assessments';
export function createAssessmentStore(db:TransactionDatabase){return Object.freeze(createAssessmentRepository(db));}
