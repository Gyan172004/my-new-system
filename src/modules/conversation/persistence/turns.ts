import { z } from 'zod';
import { repositoryClient,type TransactionDatabase,type TransactionScope } from '../../../server/transaction';
export const turnSchema=z.strictObject({id:z.uuid(),sessionId:z.uuid(),operationId:z.uuid(),speaker:z.enum(['candidate','interviewer']),stage:z.string().min(1).max(64),modality:z.enum(['text','accepted_transcript']),text:z.string().min(1).max(8192),version:z.number().int().positive()});
export type CommittedTurn=z.infer<typeof turnSchema>;
export function createTurnRepository(db:TransactionDatabase){return {
 async insert(scope:TransactionScope,raw:CommittedTurn){const t=turnSchema.parse(raw);await repositoryClient(scope,db).query('INSERT INTO conversation_turns (id,session_id,operation_id,speaker,stage,modality,text,result_session_version) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',[t.id,t.sessionId,t.operationId,t.speaker,t.stage,t.modality,t.text,t.version]);},
 async latest(scope:TransactionScope,sessionId:string){return (await repositoryClient(scope,db).query<{id:string;text:string}>('SELECT id,text FROM conversation_turns WHERE session_id=$1 AND speaker=\'interviewer\' ORDER BY result_session_version DESC,id DESC LIMIT 1',[sessionId])).rows[0]??null;},
};}
