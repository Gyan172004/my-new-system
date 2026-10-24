import { afterAll,beforeAll,expect,it } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { createHintCommandService,createAssessmentCommandService,createSessionService } from '../../../src/modules/interview-session/public';
import { createHintRoutingService } from '../../../src/modules/content-publishing/public';
import { publicationFixture, approvedChecklist,auth } from '../../helpers/catalogue-publication';
import type { TransactionDatabase } from '../../../src/server/transaction';
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
async function session(){const s=await createSessionService(f.db).createPublishedSession(f.author,f.pack.problemId);await f.db.withClient(c=>c.query("UPDATE interview_sessions SET current_stage='initial_approach',status='active' WHERE id=$1",[s.sessionId]));await createAssessmentCommandService(f.db).execute(f.author,{sessionId:s.sessionId,key:randomUUID(),expectedVersion:0,payload:{text:'I will scan linearly and compare pairs.',modality:'text' as const}},signal());return s.sessionId;}
const request=(id:string,expectedVersion:number,key=randomUUID())=>({sessionId:id,key,expectedVersion});
async function rows(id:string){return f.db.withClient(async c=>(await c.query('SELECT version,hint_count,(SELECT count(*)::int FROM hint_exposures WHERE session_id=$1) exposures,(SELECT count(*)::int FROM conversation_turns WHERE session_id=$1) turns,(SELECT count(*)::int FROM session_events WHERE session_id=$1) events FROM interview_sessions WHERE id=$1',[id])).rows[0]);}
function instrument(after:(sql:string,c:PoolClient)=>Promise<void>):TransactionDatabase{return {withClient<T>(work:(c:PoolClient)=>Promise<T>,s?:AbortSignal){return f.db.withClient(c=>work(new Proxy(c,{get(target,key,receiver){if(key==='query')return async(...args:unknown[])=>{const result=await Reflect.apply(target.query,target,args);if(typeof args[0]==='string')await after(args[0],target);return result;};return Reflect.get(target,key,receiver);}})),s);}};}
function afterFirstCall(hold:()=>Promise<void>):TransactionDatabase{let first=true;return {async withClient<T>(work:(c:PoolClient)=>Promise<T>,s?:AbortSignal){if(first){first=false;const result=await f.db.withClient(work,s);await hold();return result;}return f.db.withClient(work,s);}};}
it('has a single distinct-key winner and rejects the stale completion before dependent inserts',async()=>{
 const id=await session();let release!:()=>void;const gate=new Promise<void>(res=>{release=res;});
 const held=afterFirstCall(()=>gate);
 const slow=createHintCommandService(held).execute(f.author,request(id,1),signal());
 await new Promise(res=>setTimeout(res,50));
 const fast=await createHintCommandService(f.db).execute(f.author,request(id,1),signal());
 expect(fast.session.version).toBe(2);
 release();
 await expect(slow).rejects.toMatchObject({code:'stale_version'});
 expect(await rows(id)).toMatchObject({version:2,hint_count:1,exposures:1,turns:3,events:3});
});
it('does not duplicate in-flight work and fences an expired reclaimed worker while the stale completion replays the winning result',async()=>{
 const id=await session(),r=request(id,1);let release!:()=>void;const gate=new Promise<void>(res=>{release=res;});
 const held=afterFirstCall(()=>gate);
 const slow=createHintCommandService(held).execute(f.author,r,signal());
 await new Promise(res=>setTimeout(res,50));
 await expect(createHintCommandService(f.db).execute(f.author,r,signal())).rejects.toMatchObject({code:'operation_in_flight'});
 const before=await f.db.withClient(async c=>(await c.query("SELECT id,fence FROM session_command_operations WHERE session_id=$1 AND action_type='request_hint'",[id])).rows[0]);
 await f.db.withClient(c=>c.query("UPDATE session_command_operations SET lease_expires_at=clock_timestamp()-interval '1 second' WHERE session_id=$1 AND action_type='request_hint'",[id]));
 const reclaimed=await createHintCommandService(f.db).execute(f.author,{...r,expectedVersion:1},signal());
 release();
 expect(await slow).toEqual(reclaimed);
 const after=await f.db.withClient(async c=>(await c.query("SELECT id,fence FROM session_command_operations WHERE session_id=$1 AND action_type='request_hint'",[id])).rows[0]);
 expect(after).toMatchObject({id:before.id,fence:before.fence+1});
 expect(await rows(id)).toMatchObject({version:2,hint_count:1,exposures:1});
});
it('fresh retry headers never rebase the original failed command version',async()=>{
 const id=await session(),r=request(id,1);
 const failing=instrument(async sql=>{if(sql.startsWith('INSERT INTO hint_exposures'))throw Error('PRIVATE_DB_CANARY');});
 await expect(createHintCommandService(failing).execute(f.author,r,signal())).rejects.toThrow('hint_unavailable');
 await createHintCommandService(f.db).execute(f.author,request(id,1),signal());
 await expect(createHintCommandService(f.db).execute(f.author,{...r,expectedVersion:1},signal())).rejects.toMatchObject({code:'stale_version'});
 expect(await rows(id)).toMatchObject({version:2,hint_count:1,exposures:1});
});
it('rolls back snapshot and every owned dependent write after each injected write failure',async()=>{
 for(const boundary of ['UPDATE interview_sessions SET version','INSERT INTO hint_exposures','INSERT INTO conversation_turns','INSERT INTO session_events','UPDATE session_command_operations SET status=']){
  const id=await session();let failed=false;
  const db=instrument(async sql=>{if(!failed&&sql.startsWith(boundary)){failed=true;throw Error('PRIVATE_DB_CANARY');}});
  await expect(createHintCommandService(db).execute(f.author,request(id,1),signal())).rejects.toThrow('hint_unavailable');
  expect(failed).toBe(true);
  expect(await rows(id)).toMatchObject({version:1,hint_count:0,exposures:0,turns:2,events:2});
 }
});
it('never double-exposes a hint under concurrent distinct-key contention for the same ordinal',async()=>{
 const id=await session();const service=createHintCommandService(f.db);
 const outcomes=await Promise.allSettled([service.execute(f.author,request(id,1),signal()),service.execute(f.author,request(id,1),signal())]);
 const fulfilled=outcomes.filter((o)=>o.status==='fulfilled');
 expect(fulfilled.length).toBe(1);
 const rejected=outcomes.filter(o=>o.status==='rejected');
 expect(rejected).toHaveLength(1);
 expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({code:'stale_version'});
 expect(await rows(id)).toMatchObject({version:2,hint_count:1,exposures:1,turns:3,events:3});
 await expect(service.readOwned(f.author,id,signal())).resolves.toMatchObject({version:2});
 expect(ladder().hints.length).toBeGreaterThan(1);
});
