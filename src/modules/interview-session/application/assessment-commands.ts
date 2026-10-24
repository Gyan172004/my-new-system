import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { createTransactionRunner,abortTransaction,TransactionDomainFailure,type TransactionDatabase,type TransactionScope } from '../../../server/transaction';
import { createActiveUserLookup,type AuthenticatedCaller } from '../../identity-profile/public';
import { createAssessmentContextReader } from '../../problem-catalogue/public';
import { createAssessmentPreparer,createAssessmentStore } from '../../approach-assessment/public';
import type { ModelGateway } from '../../model-gateway/public';
import { createConversationStore } from '../../conversation/public';
import { createCommandRepository,type CommandSession,type CommandOperation,type CommandResponse,type SafeSession } from '../persistence/commands';
import { commandResponseSchema,safeSessionSchema } from '../domain/dto';
import { createHash } from 'node:crypto';
const requestSchema=z.strictObject({sessionId:z.uuid(),key:z.string().min(1).max(128).regex(/^[A-Za-z0-9_.:-]+$/),expectedVersion:z.number().int().min(0).max(2147483646),payload:z.strictObject({text:z.string().min(1).max(8192).refine(v=>v.trim().length>0&&v.isWellFormed()&&Buffer.byteLength(v)<=8192),modality:z.enum(['text','accepted_transcript'])})});
const stages=new Set(['initial_approach','approach_clarification','improve_approach']);
const hash=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
function safeSession(s:CommandSession,latestTurn:{id:string;text:string}|null):SafeSession{return safeSessionSchema.parse({sessionId:s.sessionId,problemId:s.problemId,problemPackVersion:s.problemPackVersion,status:s.status,currentStage:s.currentStage,version:s.version,createdAt:s.createdAt.toISOString(),updatedAt:s.updatedAt.toISOString(),...(latestTurn?{latestTurn}: {})});}
// Trusted server composition. The caller supplies only an owned logical command;
// admission, preparation and finalization capabilities remain inside this closure.
export function createAssessmentCommandService(db:TransactionDatabase,dependencies:Readonly<{gateway?:ModelGateway;profile?:unknown}>={}){
 const transaction=createTransactionRunner(db),commands=createCommandRepository(db),active=createActiveUserLookup(db),catalogue=createAssessmentContextReader(db),preparer=createAssessmentPreparer(db,dependencies),assessments=createAssessmentStore(db),turns=createConversationStore(db);
 const owned=async(scope:TransactionScope,owner:string,id:string)=>{if(!await active(owner,scope))abortTransaction('not_found');const s=await commands.lockSession(scope,owner,id);if(!s)abortTransaction('not_found');return s;};
 const current=(s:CommandSession,op:CommandOperation)=>{if(s.version!==op.sourceVersion)abortTransaction('stale_version');if(s.status!=='active'||s.currentStage!==op.sourceStage||!stages.has(s.currentStage))abortTransaction('invalid_transition');if(s.problemId!==op.problemId||s.problemPackVersion!==op.packVersion||s.packChecksum!==op.packChecksum)abortTransaction('pinned_content_unavailable');};
 const fence=(op:CommandOperation,original:CommandOperation)=>{if(op.fence!==original.fence||op.status!=='in_flight'||!op.leaseValid)abortTransaction('stale_worker');};
 const locked=async(scope:TransactionScope,owner:string,r:z.infer<typeof requestSchema>,original:CommandOperation)=>{const s=await owned(scope,owner,r.sessionId),op=await commands.lockOperation(scope,owner,r.sessionId,r.key);if(!op||op.id!==original.id||op.commandHash!==original.commandHash)abortTransaction('stale_worker');return {s,op};};
 return Object.freeze({
 async execute(caller:AuthenticatedCaller,raw:unknown,signal:AbortSignal):Promise<CommandResponse>{
  const parsed=requestSchema.safeParse(raw);if(!parsed.success||!z.uuid().safeParse(caller?.userId).success)throw new TransactionDomainFailure('invalid_command');
  const r=parsed.data,owner=caller.userId,commandHash=hash({actionType:'candidate_response',payload:r.payload});let work:CommandOperation|undefined;
  try {
   const admission=await transaction.run(async scope=>{const s=await owned(scope,owner,r.sessionId);let op=await commands.lockOperation(scope,owner,r.sessionId,r.key);
    if(op){if(op.commandHash!==commandHash)abortTransaction('idempotency_conflict');if(op.status==='committed')return {replay:op.replay!};if(op.status==='in_flight'&&op.leaseValid)abortTransaction('operation_in_flight');current(s,op);op=await commands.reclaim(scope,op);return {op};}
    if(s.version!==r.expectedVersion)abortTransaction('stale_version');if(s.status!=='active'||!stages.has(s.currentStage))abortTransaction('invalid_transition');
    const pin=await catalogue.resolveAssessmentPin(s.problemId,s.problemPackVersion,scope);if(s.packChecksum&&s.packChecksum!==pin.packChecksum)abortTransaction('pinned_content_unavailable');
    if(!s.packChecksum){await commands.initializeChecksum(scope,s.sessionId,pin.packChecksum);s.packChecksum=pin.packChecksum;}
    op=await commands.claim(scope,owner,r.key,commandHash,s,r.payload);return {op};
   },signal);
   if('replay' in admission)return admission.replay!;work=admission.op;
   const candidatePayload=work.payload as {text:string;modality:'text'|'accepted_transcript'};
   const prepared=await preparer.prepareContext({id:work.id,sessionId:work.sessionId,sourceVersion:work.sourceVersion,sourceStage:work.sourceStage,reservedCandidateTurnId:work.reservedCandidateTurnId!,reservedInterviewerTurnId:work.reservedInterviewerTurnId,pin:{problemId:work.problemId,packVersion:work.packVersion,packChecksum:work.packChecksum},payload:candidatePayload});
   const bound=await transaction.run(async scope=>{const {s,op}=await locked(scope,owner,r,work!);if(op.status==='committed')return op.replay!;current(s,op);fence(op,work!);await commands.bind(scope,op,prepared.contextHash,prepared.profileHash);return null;},signal);
   if(bound)return bound;
   const decision=await prepared.invoke(signal);
   return await transaction.run(async scope=>{const {s,op}=await locked(scope,owner,r,work!);if(op.status==='committed')return op.replay!;current(s,op);fence(op,work!);if(op.contextHash!==prepared.contextHash||op.profileHash!==prepared.profileHash)abortTransaction('preparation_mismatch');
    const assessmentId=randomUUID(),updated=await commands.casAssessment(scope,owner,s,op,assessmentId),candidatePayload=op.payload as {text:string;modality:'text'|'accepted_transcript'};
    await assessments.insert(scope,{id:assessmentId,sessionId:s.sessionId,operationId:op.id,candidateTurnId:op.reservedCandidateTurnId!,sourceVersion:op.sourceVersion,problemId:op.problemId,packVersion:op.packVersion,packChecksum:op.packChecksum,assessment:decision.assessment,provenance:decision.provenance});
    await turns.insert(scope,{id:op.reservedCandidateTurnId!,sessionId:s.sessionId,operationId:op.id,speaker:'candidate',stage:op.sourceStage,modality:candidatePayload.modality,text:candidatePayload.text,version:updated.version});
    await turns.insert(scope,{id:op.reservedInterviewerTurnId,sessionId:s.sessionId,operationId:op.id,speaker:'interviewer',stage:op.sourceStage,modality:'text',text:decision.text,version:updated.version});
    await commands.event(scope,owner,updated,op,assessmentId);
    const response=commandResponseSchema.parse({session:safeSession(updated,{id:op.reservedInterviewerTurnId,text:decision.text}),etag:`"${updated.version}"`});await commands.success(scope,op,response);return response;
   },signal);
  }catch(error){
   if(work){try{await transaction.run(async scope=>{const {op}=await locked(scope,owner,r,work!);if(op.fence===work!.fence&&op.status==='in_flight')await commands.retryable(scope,op);});}catch{/* The original safe failure remains authoritative; bookkeeping is best effort. */}}
   if(error instanceof TransactionDomainFailure)throw error;
   // eslint-disable-next-line preserve-caught-error -- Driver/provider causes may contain private evidence.
   throw Error('assessment_unavailable');
  }
 },
 async readOwned(caller:AuthenticatedCaller,id:string,signal?:AbortSignal):Promise<SafeSession|null>{if(!z.uuid().safeParse(caller?.userId).success||!z.uuid().safeParse(id).success)return null;try{return await transaction.run(async scope=>{if(!await active(caller.userId,scope))return null;const s=await commands.lockSession(scope,caller.userId,id);if(!s)return null;return safeSession(s,await turns.latest(scope,id));},signal);}catch{throw Error('assessment_unavailable');}},
 });
}
