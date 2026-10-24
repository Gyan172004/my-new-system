import { afterAll,beforeAll,expect,it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createHintCommandService,createAssessmentCommandService,createSessionService } from '../../../src/modules/interview-session/public';
import { createHintRoutingService } from '../../../src/modules/content-publishing/public';
import { publicationFixture, approvedChecklist,auth } from '../../helpers/catalogue-publication';
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
async function session(){const s=await createSessionService(f.db).createPublishedSession(f.author,f.pack.problemId);await f.db.withClient(c=>c.query("UPDATE interview_sessions SET current_stage='initial_approach',status='active' WHERE id=$1",[s.sessionId]));return s.sessionId;}
async function assess(id:string,expectedVersion=0){return createAssessmentCommandService(f.db).execute(f.author,{sessionId:id,key:randomUUID(),expectedVersion,payload:{text:'I will scan linearly and compare pairs.',modality:'text' as const}},signal());}
const request=(id:string,expectedVersion:number,key=randomUUID())=>({sessionId:id,key,expectedVersion});
async function rows(id:string){return f.db.withClient(async c=>(await c.query('SELECT version,hint_count,selected_ladder_id,routing_revision_hash,(SELECT count(*)::int FROM hint_exposures WHERE session_id=$1) exposures,(SELECT count(*)::int FROM conversation_turns WHERE session_id=$1) turns,(SELECT count(*)::int FROM session_events WHERE session_id=$1) events FROM interview_sessions WHERE id=$1',[id])).rows[0]);}
it('denies a hint request before any assessment exists',async()=>{const id=await session(),service=createHintCommandService(f.db);await expect(service.execute(f.author,request(id,0),signal())).rejects.toMatchObject({code:'assessment_required'});});
it('reveals the backend-routed default ladder, locks it at first exposure, and replays on the same key',async()=>{const id=await session();await assess(id);const service=createHintCommandService(f.db);const r=request(id,1);const result=await service.execute(f.author,r,signal());expect(result.session).toMatchObject({sessionId:id,version:2});expect(result.session.latestTurn?.text).toBe(ladder().hints[0]!.text);expect(JSON.stringify(result)).not.toMatch(/routingRevisionHash|exposureId|PRIVATE/);expect(await rows(id)).toMatchObject({version:2,hint_count:1,selected_ladder_id:ladder().id,exposures:1,turns:3,events:3});expect(await service.execute(f.author,{...r,expectedVersion:999},signal())).toEqual(result);expect(await service.readOwned(f.author,id,signal())).toEqual(result.session);});
it('reveals ordered hints by local ordinal and fails closed once the nonempty ladder is exhausted, never resetting the lock',async()=>{const id=await session();await assess(id);const service=createHintCommandService(f.db);let version=1;for(const hint of ladder().hints){const result=await service.execute(f.author,request(id,version),signal());expect(result.session.latestTurn?.text).toBe(hint.text);version=result.session.version;}await expect(service.execute(f.author,request(id,version),signal())).rejects.toThrow('hints_exhausted');expect(await rows(id)).toMatchObject({hint_count:ladder().hints.length,selected_ladder_id:ladder().id,exposures:ladder().hints.length});});
it('denies crossowner, invalid stage and stale versions before any reservation',async()=>{const id=await session();await assess(id);const service=createHintCommandService(f.db);await expect(service.execute(f.reviewer,request(id,1),signal())).rejects.toMatchObject({code:'not_found'});await expect(service.execute(f.author,request(id,9),signal())).rejects.toMatchObject({code:'stale_version'});await f.db.withClient(c=>c.query("UPDATE interview_sessions SET status='paused' WHERE id=$1",[id]));await expect(service.execute(f.author,request(id,1),signal())).rejects.toMatchObject({code:'invalid_transition'});expect(await rows(id)).toMatchObject({version:1,hint_count:0,exposures:0});});
it('retains the locked ladder and hint count across a later assessment on the same session',async()=>{const id=await session();await assess(id);const service=createHintCommandService(f.db);const first=await service.execute(f.author,request(id,1),signal());const before=await rows(id);await assess(id,first.session.version);const after=await rows(id);expect(after).toMatchObject({hint_count:before.hint_count,selected_ladder_id:before.selected_ladder_id,version:before.version+1});});
