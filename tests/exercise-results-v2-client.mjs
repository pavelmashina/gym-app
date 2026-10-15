import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateResultV2} from '../src/lib/exerciseResultsV2.js';
let payload,fail=false,calls=0;
const client={from(table){assert.equal(table,'performed_sets');return {
  update(value){calls++;payload=value;return this},eq(key,value){assert.equal(key,'id');assert.equal(value,'set');return this},select(value){assert.equal(value,'*');return this},
  async single(){return fail?{data:null,error:null}:{data:{id:'set',set_number:1,...payload},error:null}},
}}};
globalThis.__resultTest={client,validateResultV2};
const source=readFileSync(new URL('../src/lib/workoutSessions.js',import.meta.url),'utf8')
  .replace("import { supabase } from './supabase.js';",'const supabase=globalThis.__resultTest.client;')
  .replace("import { validateResultV2 } from './exerciseResultsV2.js';",'const validateResultV2=globalThis.__resultTest.validateResultV2;');
const {updatePerformedSet}=await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
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
fail=true;
await assert.rejects(updatePerformedSet('set',values),/Не удалось сохранить/);
delete globalThis.__resultTest;
console.log('Result client: snapshot persistence/read-back, legacy columns isolated, invalid input rejected, zero-row update not reported as success.');
