import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as resilience from '../src/lib/requestResilience.js';
import {validateResultV2} from '../src/lib/exerciseResultsV2.js';
import {flushPendingSetEdits,registerSetFlusher} from '../src/lib/resultDraftGuard.js';
import {clearSetDraft,readSetDraft,writeSetDraft} from '../src/lib/setDraftJournal.js';
import {isStaleSessionError,needsWorkoutDateMove,plannedWorkoutIsInFuture} from '../src/lib/workoutLifecycle.js';

const {createResilientFetch,describeRequestError,isNetworkError,withDeadline}=resilience;
const read=(path)=>fs.readFileSync(path,'utf8');
const realConsoleError=console.error;
console.error=()=>{};

// A request that stays pending until something aborts it, as on a dead mobile connection.
const hang=(_input,init)=>new Promise((_,reject)=>{
  init.signal.addEventListener('abort',()=>reject(new DOMException('The operation was aborted','AbortError')));
});
const API='https://project.supabase.co';

// --- Requests always end ---
{
  let calls=0;
  const fetcher=createResilientFetch((input,init)=>{calls+=1;return hang(input,init);},{writeTimeoutMs:10});
  await assert.rejects(fetcher(`${API}/rest/v1/rpc/complete_workout`,{method:'POST'}),{name:'AbortError'});
  assert.equal(calls,1,'A write whose response was lost may be applied already and must not be resent');
}
{
  const fetcher=createResilientFetch(hang,{writeTimeoutMs:10});
  await assert.rejects(fetcher(`${API}/auth/v1/token?grant_type=refresh_token`,{method:'POST'}),{name:'AbortError'},
    'A hung token refresh holds the auth lock and blocks every other request');
}
{
  let received;
  const fetcher=createResilientFetch(async(_input,init)=>{received=init;return new Response('{}');},{writeTimeoutMs:10});
  await fetcher(`${API}/storage/v1/object/photos/a.jpg`,{method:'POST'});
  assert.equal(received.signal,undefined,'Uploads may legitimately take longer than an API call');
}
{
  let calls=0;
  const fetcher=createResilientFetch((input,init)=>{
    calls+=1;
    return calls===1?hang(input,init):Promise.resolve(new Response('ok'));
  },{readTimeoutMs:10,retryDelayMs:1});
  assert.equal(await (await fetcher(`${API}/rest/v1/workout_sessions`)).text(),'ok');
  assert.equal(calls,2,'A hung read is retried');
}
{
  let calls=0;
  const fetcher=createResilientFetch(async()=>{calls+=1;return new Response('',{status:503});},{retryDelayMs:1});
  assert.equal((await fetcher(`${API}/rest/v1/workout_sessions`)).status,503);
  assert.equal(calls,2);
}
{
  let calls=0;
  const caller=new AbortController();
  const fetcher=createResilientFetch((input,init)=>{calls+=1;return hang(input,init);},{readTimeoutMs:1000,retryDelayMs:1});
  const pending=fetcher(`${API}/rest/v1/workout_sessions`,{signal:caller.signal});
  caller.abort();
  await assert.rejects(pending,{name:'AbortError'});
  assert.equal(calls,1,'A read the caller cancelled is not retried');
}

// --- Work that never reaches fetch still ends ---
assert.equal(await withDeadline(Promise.resolve('done'),1000),'done');
await assert.rejects(withDeadline(new Promise(()=>{}),5,'Слишком долго'),/Слишком долго/);
await assert.rejects(withDeadline(new Promise(()=>{}),5),(error)=>isNetworkError(error));

// --- Errors explain themselves ---
for (const message of ['TypeError: Failed to fetch','TypeError: Load failed','AbortError: signal is aborted without reason','NetworkError when attempting to fetch resource.'])
  assert.equal(isNetworkError({message}),true,message);
assert.equal(isNetworkError({code:'P0002',message:'Active workout session not found or access denied'}),false);
assert.equal(isNetworkError(null),false);
assert.match(describeRequestError({message:'TypeError: Failed to fetch'},'Не удалось завершить тренировку.'),/^Не удалось завершить тренировку\. Нет связи/);
assert.equal(describeRequestError({code:'42501',message:'denied'},'Не удалось завершить тренировку.'),'Не удалось завершить тренировку.');

// --- A running workout is never sent to the reschedule screen the server would refuse ---
const today='2026-11-06';
const planned={standalone:false,status:'scheduled',hasActiveSession:false};
assert.equal(needsWorkoutDateMove({...planned,scheduledDate:'2026-11-05',hasActiveSession:true},today),false,'Workout started before midnight, reopened after');
assert.equal(needsWorkoutDateMove({...planned,scheduledDate:'2026-11-07',hasActiveSession:true},today),false);
assert.equal(needsWorkoutDateMove({...planned,scheduledDate:'2026-11-05'},today),true);
assert.equal(needsWorkoutDateMove({...planned,scheduledDate:'2026-11-07'},today),true);
assert.equal(needsWorkoutDateMove({...planned,scheduledDate:today},today),false);
assert.equal(needsWorkoutDateMove({...planned,scheduledDate:'2026-11-05',standalone:true},today),false);
assert.equal(needsWorkoutDateMove({...planned,scheduledDate:'2026-11-05',status:'completed'},today),false);
assert.equal(plannedWorkoutIsInFuture({status:'scheduled',scheduledDate:'2026-11-07'},today),true);
assert.equal(plannedWorkoutIsInFuture({status:'scheduled',scheduledDate:'2026-11-05'},today),false,'Overdue workouts stay startable');
assert.equal(plannedWorkoutIsInFuture({status:'skipped',scheduledDate:'2026-11-07'},today),false);
assert.equal(isStaleSessionError({code:'P0002',message:'x'}),true);
assert.equal(isStaleSessionError({message:'Paused workout session not found'}),true);
assert.equal(isStaleSessionError({message:'TypeError: Failed to fetch'}),false);

// --- Finishing waits for what was just typed, and reports what could not be saved ---
await flushPendingSetEdits();
{
  const ran=[];
  const removeOk=registerSetFlusher('ok',async()=>{ran.push('ok');});
  const removeBad=registerSetFlusher('bad',async()=>{ran.push('bad');throw new Error('Не удалось сохранить подход.');});
  await assert.rejects(flushPendingSetEdits(),/Не удалось сохранить/);
  assert.deepEqual(ran.sort(),['bad','ok'],'One failed row must not stop the others from saving');
  removeBad();
  await flushPendingSetEdits();
  const replacement=async()=>{ran.push('replacement');};
  const removeReplacement=registerSetFlusher('ok',replacement);
  removeOk();
  await flushPendingSetEdits();
  assert.equal(ran.at(-1),'replacement','A remounted row keeps its registration when the old one cleans up');
  removeReplacement();
}

// --- Input typed offline survives closing the app ---
{
  const stored=new Map();
  globalThis.localStorage={getItem:(key)=>stored.get(key)??null,setItem:(key,value)=>stored.set(key,value),removeItem:(key)=>stored.delete(key)};
  assert.equal(readSetDraft('s1'),null);
  writeSetDraft('s1',{weight:'82.5',reps:'8'});
  assert.deepEqual(readSetDraft('s1'),{weight:'82.5',reps:'8'});
  clearSetDraft('s1');
  assert.equal(readSetDraft('s1'),null);
  stored.set('gym-set-draft-v1:s2','{broken');
  assert.equal(readSetDraft('s2'),null,'A damaged entry must not break the workout screen');
  globalThis.localStorage={getItem(){throw new Error('denied');},setItem(){throw new Error('denied');},removeItem(){throw new Error('denied');}};
  assert.equal(readSetDraft('s1'),null);
  writeSetDraft('s1',{weight:'1',reps:'1'});
  clearSetDraft('s1');
  delete globalThis.localStorage;
}

// --- completeWorkout, addPerformedSet and session loading against a scripted server ---
function scriptedClient(server) {
  const query=(table)=>{
    const filters={};
    const result=()=>server.read(table,filters);
    const builder={
      select:()=>builder,order:()=>builder,limit:()=>builder,in:()=>builder,
      eq(key,value){filters[key]=value;return builder;},
      insert(row){builder.inserted=row;return builder;},
      single:async()=>builder.inserted?server.insert(table,builder.inserted):result(),
      maybeSingle:async()=>result(),
      then:(resolve,reject)=>Promise.resolve(result()).then(resolve,reject),
    };
    return builder;
  };
  return {from:query,rpc:async(name,args)=>server.rpc(name,args),auth:{getUser:async()=>({data:{user:null}})}};
}
async function loadSessionsModule(server) {
  globalThis.__resilienceTest={client:scriptedClient(server),validateResultV2,resilience};
  const source=read('src/lib/workoutSessions.js')
    .replace("import { supabase } from './supabase.js';",'const supabase=globalThis.__resilienceTest.client;')
    .replace("import { validateResultV2 } from './exerciseResultsV2.js';",'const validateResultV2=globalThis.__resilienceTest.validateResultV2;')
    .replace(/import \{([^}]*)\} from '\.\/requestResilience\.js';/,'const {$1}=globalThis.__resilienceTest.resilience;');
  const module=await import(`data:text/javascript;base64,${Buffer.from(`${source}\n// ${Math.random()}`).toString('base64')}`);
  delete globalThis.__resilienceTest;
  return module;
}
const sessionRow=(status)=>({id:'session',scheduled_workout_id:'workout',status,started_at:'2026-11-06T09:00:00Z',ended_at:status==='active'?null:'2026-11-06T10:00:00Z',completed_on:null,auto_completed:status==='completed',active_duration_seconds:3600});
function serverWith({status,rpc,tables={}}) {
  return {
    read(table){
      if(table in tables)return tables[table];
      if(table==='workout_sessions')return {data:sessionRow(status()),error:null};
      if(table==='scheduled_workouts')return {data:{id:'workout',workout_name:'Ноги',scheduled_date:'2026-11-06',status:'scheduled',standalone_owner_id:null},error:null};
      return {data:[],error:null};
    },
    rpc,
    insert:tables.insert,
  };
}
{
  // Auto-completed while the screen stayed open: finishing must lead to the result, not to an endless error.
  const {completeWorkout}=await loadSessionsModule(serverWith({
    status:()=>'completed',
    rpc:()=>({data:null,error:{code:'P0002',message:'Active workout session not found or access denied'}}),
  }));
  const entry=await completeWorkout('session');
  assert.equal(entry.mode,'completed');
  assert.equal(entry.session.autoCompleted,true);
}
{
  // The server finished the session but the response was lost.
  const {completeWorkout}=await loadSessionsModule(serverWith({
    status:()=>'completed',
    rpc:()=>({data:null,error:{message:'TypeError: Failed to fetch'}}),
  }));
  assert.equal((await completeWorkout('session')).mode,'completed');
}
{
  // Really offline: the session stays active and the user is told what to do.
  const {completeWorkout}=await loadSessionsModule(serverWith({
    status:()=>'active',
    rpc:()=>({data:null,error:{message:'TypeError: Failed to fetch'}}),
  }));
  await assert.rejects(completeWorkout('session'),/Не удалось завершить тренировку\. Записанные подходы сохранены\. Нет связи/);
}
{
  // Paused: resume first, so that pause time stays out of the workout duration.
  const calls=[];
  let status='active';
  const server=serverWith({status:()=>status,rpc:(name)=>{calls.push(name);if(name==='complete_workout')status='completed';return {data:'session',error:null};}});
  const baseRead=server.read;
  let lookups=0;
  server.read=(table,filters)=>{
    if(table==='workout_sessions'&&filters.status==='active'){lookups+=1;return {data:[{id:'session',paused_at:'2026-11-06T09:30:00Z'}],error:null};}
    return baseRead(table,filters);
  };
  const {finishActiveWorkout}=await loadSessionsModule(server);
  const entry=await finishActiveWorkout('workout');
  assert.deepEqual(calls,['resume_workout','complete_workout']);
  assert.equal(lookups,1);
  assert.equal(entry.mode,'completed');
}
{
  // A failed resume must not complete the session with pause time counted in.
  const calls=[];
  const server=serverWith({status:()=>'active',rpc:(name)=>{calls.push(name);return {data:null,error:{message:'TypeError: Failed to fetch'}};}});
  const baseRead=server.read;
  server.read=(table,filters)=>table==='workout_sessions'&&filters.status==='active'?{data:[{id:'session',paused_at:'2026-11-06T09:30:00Z'}],error:null}:baseRead(table,filters);
  const {finishActiveWorkout}=await loadSessionsModule(server);
  await assert.rejects(finishActiveWorkout('workout'),/Нет связи/);
  assert.deepEqual(calls,['resume_workout']);
}
{
  // Retrying "add set" after a lost response reuses the row instead of failing or duplicating it.
  const existing={id:'existing',set_number:3,set_type:'working',planned_reps:null,weight:null,reps:null,completed:false};
  const server=serverWith({status:()=>'active',rpc:()=>({data:null,error:null})});
  server.insert=()=>({data:null,error:{code:'23505',message:'duplicate key value'}});
  const baseRead=server.read;
  server.read=(table,filters)=>table==='performed_sets'?{data:existing,error:null}:baseRead(table,filters);
  const {addPerformedSet}=await loadSessionsModule(server);
  assert.equal((await addPerformedSet('exercise',3)).id,'existing');
}
{
  // Catalog details are optional: the session must still open from its own snapshot.
  const server=serverWith({
    status:()=>'active',
    rpc:()=>({data:null,error:null}),
    tables:{
      exercises:{data:null,error:{message:'permission denied'}},
      workout_session_exercises:{data:[{id:'row',exercise_id:'e1',exercise_name_snapshot:'Жим ногами',prescription_snapshot:'',position:1,note:null}],error:null},
      performed_sets:{data:[],error:null},
    },
  });
  const {loadWorkoutSession}=await loadSessionsModule(server);
  const entry=await loadWorkoutSession('session');
  assert.equal(entry.mode,'active');
  assert.equal(entry.workout.exercises[0].name,'Жим ногами');
}
{
  const {startWorkout}=await loadSessionsModule(serverWith({
    status:()=>'active',
    rpc:()=>({data:null,error:{code:'23505',message:'Another workout is already active'}}),
  }));
  await assert.rejects(startWorkout('workout'),(error)=>error.code==='another-active');
}

// --- The screens are wired to all of the above ---
const v3=read('src/components/WorkoutSessionScreenV3.jsx');
const v4=read('src/components/WorkoutSessionScreenV4.jsx');
const v5=read('src/components/WorkoutSessionScreenV5.jsx');
assert.match(read('src/lib/supabase.js'),/createResilientFetch/);
assert.match(v4,/lifecycle\.loading\) return [^\n]*\{header\}/,'The checking screen always has a way back');
assert.match(v4,/needsWorkoutDateMove\(lifecycle, today\)/);
assert.match(v4,/hasActiveSession: Boolean\(sessions\?\.\[0\]\)/);
assert.match(v4,/if \(sessionsError\) throw sessionsError/,'A failed check must not be mistaken for "not paused"');
assert.match(v4,/onExit=\{props\.onBack\}/);
assert.match(v4,/Выйти без паузы/);
assert.match(v4,/lifecycle\.paused\) return[\s\S]*finishFromRecovery[\s\S]*Вернуться на главную/);
assert.match(v4,/if \(finishedEntry\) return <WorkoutSessionScreenV3[\s\S]*if \(lifecycle\.loading\)/,'The result of a recovery finish must not depend on the check that failed');
assert.match(v3,/if \(finishPending\.current \|\| !entry\?\.session\?\.id\) return/,'Rapid taps on finish send one request');
assert.match(v3,/entry\?\.mode === 'active' \? onBack : \(onExit \?\? onBack\)/,'Only a running session asks about pausing on the way out');
assert.match(v3,/await flushPendingSetEdits\(\)[\s\S]*completeWorkout\(entry\.session\.id\)/);
assert.match(v3,/Завершить тренировку без этих изменений/,'A rejected value must not make finishing impossible');
assert.match(v3,/registerSetFlusher\(set\.id/);
assert.match(v3,/if\(dirtyRef\.current\)return;/,'Unsent input must not be overwritten by older props');
assert.match(v3,/getWorkoutSessionState\(session\.id\)/);
assert.match(v3,/addEventListener\('visibilitychange', syncWithServer\)/);
assert.match(v3,/workout-footer-error/,'Errors stay visible wherever the list is scrolled');
assert.match(v5,/plannedWorkoutIsInFuture\(result\.workout, localDateKey\(\)\)/);
assert.match(v5,/Перейти к текущей тренировке/);
assert.match(v5,/initialEntry=\{loadedEntry\}/,'An already loaded session is not fetched a second time');

console.error=realConsoleError;
console.log('Workout session resilience tests passed.');
