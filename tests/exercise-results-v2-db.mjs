import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const db=new PGlite();
const alice=randomUUID(),bob=randomUUID(),schedule=randomUUID(),session=randomUUID();
try {
  await db.exec(`create role authenticated;create role anon;create role service_role bypassrls;
    create schema auth;create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema public,auth to authenticated,anon;
    insert into auth.users values('${alice}'),('${bob}');
    create table scheduled_workouts(id uuid primary key);create table scheduled_workout_exercises(id uuid primary key);create table scheduled_sets(id uuid primary key);
    insert into scheduled_workouts values('${schedule}');`);
  await db.exec(read('../supabase/schema/exercises.sql'));
  for(const name of ['20261015084238_exercise_catalog_v2_foundation.sql','20261015090011_exercise_machine_profiles.sql'])await db.exec(read('../supabase/migrations/'+name));
  await db.exec(read('../supabase/schema/workout-session.sql').split('create or replace function public.start_workout')[0]);
  await db.query('insert into workout_sessions(id,user_id,scheduled_workout_id) values($1,$2,$3)',[session,alice,schedule]);
  const exercise=randomUUID(),sessionExercise=randomUUID(),oldSet=randomUUID();
  await db.query("insert into exercises(id,name,muscle_group,exercise_type,movement_type) values($1,'Legacy','Ноги','Силовое','Присед')",[exercise]);
  await db.query('insert into workout_session_exercises(id,workout_session_id,exercise_id,position) values($1,$2,$3,1)',[sessionExercise,session,exercise]);
  await db.query('insert into performed_sets(id,workout_session_exercise_id,set_number,weight,reps,completed) values($1,$2,1,42,10,true)',[oldSet,sessionExercise]);
  const before=(await db.query('select * from performed_sets')).rows[0];
  const migration=read('../supabase/migrations/20261015100010_exercise_result_snapshots_v2.sql');
  await db.exec(migration);await db.exec(migration);
  assert.deepEqual((await db.query('select * from performed_sets')).rows[0],{...before,result_v2:null,result_equipment_instance_id:null});
  const cases=[
    ['weight_reps','barbell_total',{weight:42,reps:10}],
    ['bodyweight_reps','bodyweight',{reps:12}],
    ['assisted_reps','assistance',{reps:8,assistance_weight:25}],
    ['duration','none',{duration_seconds:45}],
    ['carry','dumbbell_each',{weight:20,distance_meters:30}],
    ['cardio','none',{duration_seconds:90,distance_meters:400}],
  ];
  let index=2;
  for(const [kind,load,metrics] of cases){
    const eid=randomUUID(),sid=randomUUID(),setid=randomUUID();
    await db.query(`insert into exercises(id,name,muscle_group,exercise_type,movement_type,measurement_type,load_mode,laterality)
      values($1,$2,'Ноги','Силовое','Движение',$3,$4,'bilateral')`,[eid,kind,kind,load]);
    await db.query('insert into workout_session_exercises(id,workout_session_id,exercise_id,position) values($1,$2,$3,$4)',[sid,session,eid,index++]);
    const result={metric_version:'v2',exercise_id:eid,measurement_type:kind,load_mode:load,weight_unit:'kg',configuration_key:'standard',laterality:'bilateral',set_type:'working',completed:true,...metrics};
    await db.exec(`set role authenticated;select set_config('request.jwt.claim.sub','${alice}',false)`);
    await db.query('insert into performed_sets(id,workout_session_exercise_id,set_number,completed,result_v2) values($1,$2,1,true,$3)',[setid,sid,result]);
    assert.deepEqual((await db.query('select result_v2 from performed_sets where id=$1',[setid])).rows[0].result_v2,result);
    for(const bad of [{...result,load_mode:'unknown'},{...result,configuration_key:'changed'},{...result,side:'left'},{...result,...Object.fromEntries(Object.keys(metrics).map(k=>[k,-1]))}])
      await assert.rejects(db.query('update performed_sets set result_v2=$2 where id=$1',[setid,bad]),e=>e.code==='23514');
    await assert.rejects(db.query('update performed_sets set result_v2=null where id=$1',[setid]),e=>e.code==='23514');
    await db.exec(`select set_config('request.jwt.claim.sub','${bob}',false)`);
    assert.equal((await db.query('select * from performed_sets where id=$1',[setid])).rows.length,0);
    assert.equal((await db.query('update performed_sets set completed=false where id=$1 returning id',[setid])).rows.length,0);
    await db.exec('reset role');
  }
  assert.deepEqual((await db.query('select * from performed_sets where id=$1',[oldSet])).rows[0],{...before,result_v2:null,result_equipment_instance_id:null});
  await db.exec('set role anon');
  await assert.rejects(db.exec('select * from performed_sets'),e=>e.code==='42501');
  console.log('Result SQL: six formats persist, immutable contexts, legacy unchanged, repeatable migration, two-owner RLS and anonymous denial passed.');
} finally {await db.close();}
