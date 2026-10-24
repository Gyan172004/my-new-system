import { createHash } from 'node:crypto';
import { z } from 'zod';
import { createAssessmentContextReader,type AssessmentPin } from '../../problem-catalogue/public';
import { approachAssessmentInputSchema,type ModelGateway } from '../../model-gateway/public';
import type { TransactionDatabase } from '../../../server/transaction';
import { classify,classificationProfileSchema,projectAssessment,unqualifiedAssessment } from '../domain/classify';
import { evidenceContextSchema,validateProposal } from '../domain/proposal';
const version=z.string().min(1).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]*$/);
export const assessmentRuntimeProfileSchema=classificationProfileSchema.extend({labelsQualified:z.boolean(),qualification:z.strictObject({datasetRef:version,reportRef:version,reviewRef:version}),policyVersion:version,rubricVersion:version,promptVersion:version,modelVersion:version});
export type AssessmentRuntimeProfile=z.infer<typeof assessmentRuntimeProfileSchema>;
export interface AssessmentPreparationWork {id:string;sessionId:string;sourceVersion:number;sourceStage:string;reservedCandidateTurnId:string;reservedInterviewerTurnId:string;pin:AssessmentPin;payload:{text:string;modality:'text'|'accepted_transcript'};}
export const fingerprint=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
function freeze<T>(value:T):T {if(value&&typeof value==='object'){for(const v of Object.values(value))freeze(v);Object.freeze(value);}return value;}
export function createAssessmentPreparer(db:TransactionDatabase,dependencies:Readonly<{gateway?:ModelGateway;profile?:unknown}>={}) {
 const profile=dependencies.profile===undefined?null:freeze(assessmentRuntimeProfileSchema.parse(dependencies.profile));
 const reader=createAssessmentContextReader(db);
 return Object.freeze({async prepareContext(work:AssessmentPreparationWork){
  const context=await reader.readPinnedAssessmentContext(work.pin);
  const evidence=[{id:work.reservedCandidateTurnId,sessionId:work.sessionId,version:work.sourceVersion+1,speaker:'candidate' as const,stage:work.sourceStage,modality:work.payload.modality,text:work.payload.text}];
  const input=approachAssessmentInputSchema.parse({text:work.payload.text,references:context.references,evidence});
  const verification=evidenceContextSchema.parse({sessionId:work.sessionId,sourceVersion:work.sourceVersion,reservedCandidateTurnId:work.reservedCandidateTurnId,referenceIds:context.references.map(r=>r.id),evidence});
  if(Buffer.byteLength(JSON.stringify(input))>16384||Buffer.byteLength(JSON.stringify(verification))>16384)throw Error('assessment_context_limit');
  const contextHash=fingerprint({pin:work.pin,input,verification}),profileHash=fingerprint(profile??{labelsQualified:false,policyVersion:'unqualified-v1'});
  freeze(input);freeze(verification);
  return Object.freeze({contextHash,profileHash,async invoke(signal:AbortSignal){
   signal.throwIfAborted();
   let assessment=unqualifiedAssessment(),metadata:unknown=null;
   if(profile?.labelsQualified){
    if(!dependencies.gateway)throw Error('assessment_unavailable');
    const result=await dependencies.gateway.invoke({operation:'approach_assessment',input,context:{requestId:work.id,operationId:work.id,sessionId:work.sessionId,expectedSessionVersion:work.sourceVersion,packVersion:work.pin.packVersion,rubricVersion:profile.rubricVersion,policyVersion:profile.policyVersion},signal});
    if(!result.ok)throw Error('assessment_unavailable');
    if(result.metadata.configuredModel!==profile.modelVersion||result.metadata.promptVersion!==profile.promptVersion)throw Error('assessment_profile_mismatch');
    assessment=classify(validateProposal(result.data,verification),{id:profile.id,tau:profile.tau,delta:profile.delta,minEvidenceRefs:profile.minEvidenceRefs,scoreComparison:profile.scoreComparison});metadata=result.metadata;
   }
   return freeze({assessment,text:projectAssessment(assessment).text,provenance:{schemaVersion:1,evaluatorVersion:'assessment-v1',profileHash,contextHash,policyVersion:profile?.policyVersion??'unqualified-v1',rubricVersion:profile?.rubricVersion??null,promptVersion:profile?.promptVersion??null,modelVersion:profile?.modelVersion??null,qualification:profile?.qualification??null,metadata}});
  }});
 }});
}
