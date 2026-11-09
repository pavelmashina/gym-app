import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateResultV2} from '../src/lib/exerciseResultsV2.js';

// A stand-in for supabase-js: `answer` decides what the update returns, `stored` is the row on the server.
let payload,calls=0,reads=0,answer='ok',stored=null,readFails=false;
const networkError={message:'TypeError: Load failed',details:'',hint:'',code:''};
const client={from(table){assert.equal(table,'performed_sets');let mode='read';return {
  update(value){calls++;payload=value;mode='write';return this},
  eq(key,value){assert.equal(key,'id');assert.equal(value,'set');return this},
  select(value){assert.equal(value,'*');return this},
  async single(){
    assert.equal(mode,'write');
    if(answer==='empty')return {data:null,error:null};
    // The server applies the write, but its answer never reaches the phone (issue #64).
    if(answer==='lost'){stored={id:'set',set_number:1,...payload};return {data:null,error:networkError};}
    if(answer==='offline')return {data:null,error:networkError};
    if(answer==='immutable')return {data:null,error:{message:'Snapshot context is immutable: configuration_key',code:'23514'}};
    if(answer==='invalid')return {data:null,error:{message:'Missing metric: reps',code:'23514'}};
    stored={id:'set',set_number:1,...payload};
    return {data:stored,error:null};
  },
  async maybeSingle(){
    assert.equal(mode,'read','The check after a lost answer only reads');
    reads++;
    return readFails?{data:null,error:networkError}:{data:stored,error:null};
  },
}}};
globalThis.__resultTest={client,validateResultV2,resilience:await import('../src/lib/requestResilience.js')};
const source=readFileSync(new URL('../src/lib/workoutSessions.js',import.meta.url),'utf8')
  .replace("import { supabase } from './supabase.js';",'const supabase=globalThis.__resultTest.client;')
  .replace("import { validateResultV2 } from './exerciseResultsV2.js';",'const validateResultV2=globalThis.__resultTest.validateResultV2;')
  .replace(/import \{([^}]*)\} from '\.\/requestResilience\.js';/,'const {$1}=globalThis.__resultTest.resilience;');
const {updatePerformedSet}=await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const realConsoleError=console.error;
console.error=()=>{};

const result={metric_version:'v2',exercise_id:'exercise',measurement_type:'duration',load_mode:'none',weight_unit:'kg',configuration_key:'standard',laterality:'bilateral',set_type:'working',completed:true,duration_seconds:45};
const values={setType:'working',completed:true,resultV2:result,completedAt:'2026-10-15T09:00:00.000Z'};
const saved=await updatePerformedSet('set',values);
assert.equal(saved.resultV2.duration_seconds,45);
assert.equal(saved.weight,'');assert.equal(saved.reps,'');
assert.equal(payload.weight,null);assert.equal(payload.reps,null);
assert.equal(saved.completedAt,values.completedAt);
await updatePerformedSet('set',{...values,completed:false});
assert.equal(payload.result_v2.completed,false);assert.equal(payload.completed_at,null);
const before=calls;
await assert.rejects(updatePerformedSet('set',{...values,resultV2:{...result,duration_seconds:-1}}),/Проверьте/);
assert.equal(calls,before,'Invalid input must not be sent');
answer='empty';
await assert.rejects(updatePerformedSet('set',values),/^Error: Не удалось сохранить подход\.$/);

// Issue #64: the dumbbell press from the report, 5 kg × 12, saved on the server while the answer was lost.
const dumbbells={metric_version:'v2',exercise_id:'exercise',measurement_type:'weight_reps',load_mode:'dumbbell_each',weight_unit:'kg',configuration_key:'standard',equipment_instance_id:null,laterality:'bilateral',set_type:'working',completed:true,weight:5,reps:12};
const press={setType:'working',completed:true,resultV2:dumbbells};
const immutableText=/Настройки уже записанного подхода|другими настройками/;
stored=null;answer='lost';reads=0;
const recovered=await updatePerformedSet('set',press);
assert.equal(reads,1,'A lost answer is followed by one read of the row');
assert.equal(recovered.completed,true,'A set the server saved is shown as saved');
assert.equal(recovered.resultV2.weight,5);assert.equal(recovered.resultV2.reps,12);

// The write did not reach the server: a connection problem, never a word about the set's settings.
stored=null;answer='offline';reads=0;
await assert.rejects(updatePerformedSet('set',press),(error)=>{
  assert.equal(error.message,'Не удалось сохранить подход. Проверьте интернет и повторите.');
  return true;
});
assert.equal(reads,1);
// The server holds another result for this set (an earlier tap): still not a success.
stored={id:'set',set_number:1,completed:false,result_v2:{...dumbbells,completed:false}};
await assert.rejects(updatePerformedSet('set',press),/Проверьте интернет/);
// The check itself fails on the same dead connection.
stored={id:'set',set_number:1,completed:true,result_v2:dumbbells};readFails=true;
await assert.rejects(updatePerformedSet('set',press),/Проверьте интернет/);
readFails=false;
// Only the server's refusal to change a recorded set's context speaks of its settings.
answer='immutable';reads=0;
await assert.rejects(updatePerformedSet('set',press),/уже записан с другими настройками выполнения/);
assert.equal(reads,0,'A refusal from the server is not a lost answer');
answer='invalid';
await assert.rejects(updatePerformedSet('set',press),(error)=>{
  assert.equal(error.message,'Не удалось сохранить подход. Проверьте введённые значения.');
  return true;
});

const workoutSource=readFileSync(new URL('../src/lib/workoutSessions.js',import.meta.url),'utf8');
assert.doesNotMatch(workoutSource,/Настройки уже записанного подхода менять нельзя/,'Every failed save used to blame the set settings (#64)');

console.error=realConsoleError;
delete globalThis.__resultTest;
console.log('Result client: snapshot persistence/read-back, legacy columns isolated, invalid input rejected, zero-row update not reported as success, a lost answer re-checked against the row (#64), network failures and server refusals named apart.');
