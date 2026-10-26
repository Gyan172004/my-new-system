import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { createTransactionRunner,abortTransaction,TransactionDomainFailure,type TransactionDatabase,type TransactionScope } from '../../../server/transaction';
import { createActiveUserLookup,type AuthenticatedCaller } from '../../identity-profile/public';
import { createAssessmentContextReader } from '../../problem-catalogue/public';
import { createAssessmentStore } from '../../approach-assessment/public';
import { selectHintLadder } from '../../content-publishing/public';
import { createConversationStore } from '../../conversation/public';
import { createExposureStore,nextHint,policyVersion } from '../../hints-variants/public';
import { createCommandRepository,type CommandSession,type CommandOperation,type CommandResponse,type SafeSession } from '../persistence/commands';
import { commandResponseSchema,safeSessionSchema } from '../domain/dto';
import { createHash } from 'node:crypto';
const requestSchema=z.strictObject({sessionId:z.uuid(),key:z.string().min(1).max(128).regex(/^[A-Za-z0-9_.:-]+$/),expectedVersion:z.number().int().min(0).max(2147483646)});
const stages=new Set(['hints']);
const hash=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
function safeSession(s:CommandSession,latestTurn:{id:string;text:string}|null):SafeSession{return safeSessionSchema.parse({sessionId:s.sessionId,problemId:s.problemId,problemPackVersion:s.problemPackVersion,status:s.status,currentStage:s.currentStage,version:s.version,createdAt:s.createdAt.toISOString(),updatedAt:s.updatedAt.toISOString(),...(latestTurn?{latestTurn}: {})});}
// Trusted server composition. Deterministic, no provider call; the ledger/fence
// split is retained for symmetry with assessment commands and crash/race safety.
export function createHintCommandService(db:TransactionDatabase){
 const transaction=createTransactionRunner(db),commands=createCommandRepository(db),active=createActiveUserLookup(db),catalogue=createAssessmentContextReader(db),assessments=createAssessmentStore(db),turns=createConversationStore(db),exposures=createExposureStore(db);
 const owned=async(scope:TransactionScope,owner:string,id:string)=>{if(!await active(owner,scope))abortTransaction('not_found');const s=await commands.lockSession(scope,owner,id);if(!s)abortTransaction('not_found');return s;};
 const current=(s:CommandSession,op:CommandOperation)=>{if(s.version!==op.sourceVersion)abortTransaction('stale_version');if(s.status!=='active'||s.currentStage!==op.sourceStage||!stages.has(s.currentStage))abortTransaction('invalid_transition');if(s.problemId!==op.problemId||s.problemPackVersion!==op.packVersion||s.packChecksum!==op.packChecksum)abortTransaction('pinned_content_unavailable');};
 const fence=(op:CommandOperation,original:CommandOperation)=>{if(op.fence!==original.fence||op.status!=='in_flight'||!op.leaseValid)abortTransaction('stale_worker');};
 const locked=async(scope:TransactionScope,owner:string,r:z.infer<typeof requestSchema>,original:CommandOperation)=>{const s=await owned(scope,owner,r.sessionId),op=await commands.lockOperation(scope,owner,r.sessionId,r.key);if(!op||op.id!==original.id||op.commandHash!==original.commandHash)abortTransaction('stale_worker');return {s,op};};
 return Object.freeze({
 async execute(caller:AuthenticatedCaller,raw:unknown,signal:AbortSignal):Promise<CommandResponse>{
  const parsed=requestSchema.safeParse(raw);if(!parsed.success||!z.uuid().safeParse(caller?.userId).success)throw new TransactionDomainFailure('invalid_command');
  const r=parsed.data,owner=caller.userId,commandHash=hash({actionType:'request_hint',payload:{}});let work:CommandOperation|undefined;
  try {
   const admission=await transaction.run(async scope=>{const s=await owned(scope,owner,r.sessionId);let op=await commands.lockOperation(scope,owner,r.sessionId,r.key);
    if(op){if(op.commandHash!==commandHash)abortTransaction('idempotency_conflict');if(op.status==='committed')return {replay:op.replay!};if(op.status==='in_flight'&&op.leaseValid)abortTransaction('operation_in_flight');current(s,op);op=await commands.reclaim(scope,op);return {op};}
    if(s.version!==r.expectedVersion)abortTransaction('stale_version');if(s.status!=='active'||!stages.has(s.currentStage))abortTransaction('invalid_transition');
    if(!s.packChecksum||!s.latestAssessmentId)abortTransaction('assessment_required');
    op=await commands.claim(scope,owner,r.key,commandHash,s,{},'request_hint');return {op};
   },signal);
   if('replay' in admission)return admission.replay!;work=admission.op;
   return await transaction.run(async scope=>{const {s,op}=await locked(scope,owner,r,work!);if(op.status==='committed')return op.replay!;current(s,op);fence(op,work!);
    const pin={problemId:op.problemId,packVersion:op.packVersion,packChecksum:op.packChecksum};
    let ladderId=s.selectedLadderId,routingHash=s.routingRevisionHash;
    if(!ladderId||!routingHash){
     const outcome=await assessments.readOutcome(scope,s.sessionId,s.latestAssessmentId!);
     const [routingCatalogue,route]=await Promise.all([catalogue.readRoutingCatalogue(pin,scope),catalogue.readPinnedHintRouting(pin)]);
     ladderId=selectHintLadder(route,routingCatalogue,outcome.matchedReferenceId);routingHash=route.hash;
    }
    const ladder=await catalogue.readPinnedHintLadder(pin,ladderId);
    let hint;try{hint=nextHint(ladder,s.hintCount);}catch(e){abortTransaction((e as Error).message);}
    const exposureId=randomUUID(),updated=await commands.casHint(scope,owner,s,op,{ladderId,routingHash});
    await exposures.insert(scope,{id:exposureId,sessionId:s.sessionId,operationId:op.id,turnId:op.reservedInterviewerTurnId,ladderId,routingRevisionHash:routingHash,hintId:hint.id,localOrdinal:s.hintCount+1,sourceVersion:op.sourceVersion,problemId:op.problemId,packVersion:op.packVersion,packChecksum:op.packChecksum,policyVersion});
    await turns.insert(scope,{id:op.reservedInterviewerTurnId,sessionId:s.sessionId,operationId:op.id,speaker:'interviewer',stage:op.sourceStage,modality:'text',text:hint.text,version:updated.version});
    await commands.hintEvent(scope,owner,updated,op,exposureId,hint.id,ladderId,s.hintCount+1);
    const response=commandResponseSchema.parse({session:safeSession(updated,{id:op.reservedInterviewerTurnId,text:hint.text}),etag:`"${updated.version}"`});await commands.success(scope,op,response);return response;
   },signal);
  }catch(error){
   if(work){try{await transaction.run(async scope=>{const {op}=await locked(scope,owner,r,work!);if(op.fence===work!.fence&&op.status==='in_flight')await commands.retryable(scope,op);});}catch{/* The original safe failure remains authoritative; bookkeeping is best effort. */}}
   if(error instanceof TransactionDomainFailure)throw error;
   // eslint-disable-next-line preserve-caught-error -- Driver/content causes may contain private evidence.
   throw Error('hint_unavailable');
  }
 },
 async readOwned(caller:AuthenticatedCaller,id:string,signal?:AbortSignal):Promise<SafeSession|null>{if(!z.uuid().safeParse(caller?.userId).success||!z.uuid().safeParse(id).success)return null;try{return await transaction.run(async scope=>{if(!await active(caller.userId,scope))return null;const s=await commands.lockSession(scope,caller.userId,id);if(!s)return null;return safeSession(s,await turns.latest(scope,id));},signal);}catch{throw Error('hint_unavailable');}},
 });
}
