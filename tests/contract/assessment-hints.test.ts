import { afterAll,beforeAll,expect,it } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  createAssessmentCommandService,
  createHintCommandService,
  createSessionService,
  commandResponseSchema,
  approachAssessedEventSchema,
  hintExposedEventSchema,
} from '../../src/modules/interview-session/public';
import { createModelGateway, type AdapterRequest } from '../../src/modules/model-gateway/public';
import { createHintRoutingService } from '../../src/modules/content-publishing/public';
import { publicationFixture, approvedChecklist,auth } from '../helpers/catalogue-publication';
import { profile as classification } from '../fixtures/approach-assessment/semantic';

let f:Awaited<ReturnType<typeof publicationFixture>>;
let pin:{problemId:string;packVersion:string;packChecksum:string};
beforeAll(async()=>{
 f=await publicationFixture();
 const review=await f.service.review(auth,f.raw(),{decision:'approved',checklist:approvedChecklist});
 const published=await f.service.publish(auth,f.raw(),review.reviewId);
 pin={problemId:f.pack.problemId,packVersion:f.pack.version,packChecksum:published.event.payload.contentChecksum};
 const manifest={schemaVersion:1 as const,...pin,revision:'routing-v1',authorId:f.author.userId,provenance:'synthetic independently reviewed fixture',defaultLadderId:f.pack.interview.hintLadders[0]!.id,approachLadders:f.pack.interview.hintLadders.map(l=>({approachId:l.approachId,ladderId:l.id}))};
 const routing=createHintRoutingService(f.db,{identity:f.identity,staff:f.staff});
 const reviewed=await routing.review(auth,manifest,'evidence-routing-v1');
 await routing.install(auth,manifest,reviewed.reviewId);
},30000);
afterAll(async()=>{await f?.close();},30000);
const signal=()=>new AbortController().signal;
const ladder=()=>f.pack.interview.hintLadders[0]!;
const qualified={...classification,labelsQualified:true,qualification:{datasetRef:'reviewed-synthetic',reportRef:'mechanics-only',reviewRef:'independent-fixture-review'},policyVersion:'synthetic-v1',rubricVersion:'synthetic-v1',promptVersion:'1',modelVersion:'fake-probe-v1'};
function gateway(){return createModelGateway({environment:'test',adapter:{provider:'fake',async send(r:AdapterRequest){const i=r.input as {evidence:{id:string}[];references:{id:string}[]};return {status:'complete',text:JSON.stringify({schemaVersion:1,operation:'approach_assessment',summary:'PRIVATE_PROVIDER_CANARY',interpretation:'understood',matches:[{referenceId:i.references[0]!.id,confidence:0.9,evidenceRefs:[{turnId:i.evidence[0]!.id,span:null}]}],findings:[],missingEvidence:[],candidateComplexity:{time:null,space:null}}),reportedModel:null,usage:null};}}});}
async function session(){const s=await createSessionService(f.db).createPublishedSession(f.author,f.pack.problemId);await f.db.withClient(c=>c.query("UPDATE interview_sessions SET current_stage='initial_approach',status='active' WHERE id=$1",[s.sessionId]));return s.sessionId;}
async function events(id:string){return (await f.db.withClient(c=>c.query('SELECT session_version,event_type,payload FROM session_events WHERE session_id=$1 ORDER BY session_version',[id]))).rows;}
async function privateColumns(id:string){const a=await f.db.withClient(c=>c.query('SELECT id AS "assessmentId" FROM approach_assessments WHERE session_id=$1',[id]));const e=await f.db.withClient(c=>c.query('SELECT id AS "exposureId",ladder_id AS "ladderId",routing_revision_hash AS "routingRevisionHash" FROM hint_exposures WHERE session_id=$1',[id]));const s=await f.db.withClient(c=>c.query('SELECT pack_checksum AS "packChecksum" FROM interview_sessions WHERE id=$1',[id]));return {assessments:a.rows,exposures:e.rows,session:s.rows[0]};}

it('composes the real assessment and hint services on canonical safe-DTO/event shapes with no candidate private IDs, raw provider prose, or future hint leakage',async()=>{
 const id=await session();
 const g=gateway();
 let result:unknown;
 try {
  result=await createAssessmentCommandService(f.db,{gateway:g,profile:qualified}).execute(f.author,{sessionId:id,key:randomUUID(),expectedVersion:0,payload:{text:'I will scan linearly and compare pairs.',modality:'text' as const}},signal());
 } finally { await g.close(); }
 expect(commandResponseSchema.safeParse(result).success).toBe(true);

 const hintService=createHintCommandService(f.db);
 const first=await hintService.execute(f.author,{sessionId:id,key:randomUUID(),expectedVersion:1},signal());
 expect(commandResponseSchema.safeParse(first).success).toBe(true);
 expect(first.session.latestTurn?.text).toBe(ladder().hints[0]!.text);

 const second=await hintService.execute(f.author,{sessionId:id,key:randomUUID(),expectedVersion:2},signal());
 expect(commandResponseSchema.safeParse(second).success).toBe(true);
 expect(second.session.latestTurn?.text).toBe(ladder().hints[1]!.text);
 // No future hint leakage: the first exposure's wire response never contains a later hint's text.
 expect(JSON.stringify(first)).not.toContain(ladder().hints[1]!.text);
 expect(JSON.stringify(first)).not.toContain(ladder().hints[2]!.text);
 expect(JSON.stringify(second)).not.toContain(ladder().hints[2]!.text);
 expect(JSON.stringify(second)).not.toContain(ladder().hints[3]!.text);

 const priv=await privateColumns(id);
 const serialized=[JSON.stringify(result),JSON.stringify(first),JSON.stringify(second)].join('\n');
 expect(serialized).not.toMatch(/PRIVATE|PRIVATE_PROVIDER_CANARY/);
 for (const row of priv.assessments) expect(serialized).not.toContain(row.assessmentId);
 for (const row of priv.exposures) {
  expect(serialized).not.toContain(row.exposureId);
  expect(serialized).not.toContain(row.routingRevisionHash);
 }
 expect(serialized).not.toContain(priv.session!.packChecksum);
 expect(serialized).not.toContain(ladder().id);

 const rows=await events(id);
 expect(rows.length).toBe(new Set(rows.map(r=>r.session_version)).size);
 for (const row of rows) {
  expect(Buffer.byteLength(JSON.stringify(row.payload))).toBeLessThanOrEqual(4096);
  if (row.event_type==='interview.approach_assessed')
   expect(approachAssessedEventSchema.safeParse(row.payload).success).toBe(true);
  if (row.event_type==='interview.hint.exposed')
   expect(hintExposedEventSchema.safeParse(row.payload).success).toBe(true);
 }
 expect(rows.filter(r=>r.event_type==='interview.approach_assessed')).toHaveLength(1);
 expect(rows.filter(r=>r.event_type==='interview.hint.exposed')).toHaveLength(2);
});

it('fails closed without leaking anything when no hint routing has been reviewed/installed for the pinned release',async()=>{
 const g2=await publicationFixture();
 try {
  const review=await g2.service.review(auth,g2.raw(),{decision:'approved',checklist:approvedChecklist});
  await g2.service.publish(auth,g2.raw(),review.reviewId);
  const s=await createSessionService(g2.db).createPublishedSession(g2.author,g2.pack.problemId);
  await g2.db.withClient(c=>c.query("UPDATE interview_sessions SET current_stage='initial_approach',status='active' WHERE id=$1",[s.sessionId]));
  await createAssessmentCommandService(g2.db).execute(g2.author,{sessionId:s.sessionId,key:randomUUID(),expectedVersion:0,payload:{text:'I will scan linearly and compare pairs.',modality:'text' as const}},signal());
  await expect(createHintCommandService(g2.db).execute(g2.author,{sessionId:s.sessionId,key:randomUUID(),expectedVersion:1},signal())).rejects.toThrow('hint_unavailable');
  const rows=await g2.db.withClient(c=>c.query('SELECT version,hint_count,selected_ladder_id FROM interview_sessions WHERE id=$1',[s.sessionId]));
  expect(rows.rows[0]).toMatchObject({version:1,hint_count:0,selected_ladder_id:null});
 } finally { await g2.close(); }
});
