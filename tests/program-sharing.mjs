import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { buildCatalogRelease } from '../scripts/exercise-catalog-release.mjs';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const schema = JSON.parse(read('./fixtures/catalog-live-schema-20261015.json'));
const legacy = JSON.parse(read('../docs/exercise-catalog-v2/legacy-shared-catalog.json'));
const db = new PGlite();
const alice='00000000-0000-4000-8000-000000000001';
const bob='00000000-0000-4000-8000-000000000002';
const carol='00000000-0000-4000-8000-000000000003';
const custom='30000000-0000-4000-8000-000000000001';
const legacyNamed='30000000-0000-4000-8000-000000000002';
const secret='30000000-0000-4000-8000-000000000003';
const q=async(sql,args=[]) => (await db.query(sql,args)).rows;
const scalar=async(sql,args=[]) => (await q(sql,args))[0]?.value;
const login=async(id)=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role authenticated');};
const quote=s=>'"'+s.replaceAll('"','""')+'"';

try {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create schema private; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable
      as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema public,auth to authenticated,anon,service_role;
    insert into auth.users values('${alice}'),('${bob}'),('${carol}');`);
  for(const t of schema.tables) await db.exec(t.ddl);
  for(const c of [...schema.constraints].sort((a,b)=>Number(a.foreign)-Number(b.foreign))) await db.exec(c.sql);
  for(const i of schema.indexes) await db.exec(i);
  for(const f of schema.functions) await db.exec(f.sql);
  for(const t of schema.tables) if(t.rls) await db.exec(`alter table public.${quote(t.name)} enable row level security`);
  for(const p of schema.policies) await db.exec(`create policy ${quote(p.name)} on public.${quote(p.table)} as ${p.permissive} for ${p.cmd} to ${p.roles.map(quote).join(',')} ${p.qual?'using ('+p.qual+')':''} ${p.check?'with check ('+p.check+')':''}`);
  for(const g of schema.grants) await db.exec(`grant ${g.privilege} on public.${quote(g.table)} to ${quote(g.role)}`);
  for(const e of legacy) await db.query(
    'insert into exercises(id,name,muscle_group,exercise_type,movement_type,technique,equipment) values($1,$2,$3,$4,$5,$6,$7)',
    [e.id,e.name,e.muscle_group,e.exercise_type,e.movement_type,e.technique,e.equipment]);
  await db.exec(buildCatalogRelease({publish:true}));
  await db.exec(`create table public.profiles(id uuid primary key references auth.users(id),display_name text);
    insert into public.profiles(id,display_name) values('${alice}','Alice'),('${bob}','Bob');`);

  // Storage is a Supabase service: a stub table is enough to exercise the read policies.
  await db.exec(`create schema storage; create table storage.objects(bucket_id text,name text);
    alter table storage.objects enable row level security;
    grant usage on schema storage to authenticated; grant select on storage.objects to authenticated;
    alter table public.exercises add column if not exists photo_path text, add column if not exists photo_paths text[];
    alter table public.performed_sets add column if not exists result_v2 jsonb;`);
  await db.exec(read('../supabase/schema/program-sharing.sql'));

  await login(alice);
  const exercise=await scalar("select id value from exercise_catalog_v2 where measurement_type='weight_reps' limit 1");
  const payload={name:'Shared sample',description:'Private template copy test',week_count:1,structure_mode:'cycle',cycle_repeat_count:3,schedule_mode:'custom',categories:['Сила'],weeks:[{workouts:[{name:'Workout A',rest_days_after:2,exercises:[{exercise_id:exercise,exercise_name_snapshot:'Exercise A',sets:[{reps:8},{reps:10}]}]}]}]};
  const original=await scalar('select create_program_with_schedule($1::jsonb) value',[JSON.stringify(payload)]);
  const code=await scalar('select create_program_share($1) value',[original]);
  assert(code,'owner can create a share');
  const ownerPreview=await scalar('select preview_program_share($1)::text value',[code]);
  assert.equal(JSON.parse(ownerPreview).own_program,true);
  const ownerAttempt=q('select accept_program_share($1)',[code]);
  await assert.rejects(ownerAttempt,'owner cannot accept own invite');

  await login(bob);
  assert.equal(await scalar('select count(*)::int value from programs'),0,'recipient cannot browse source programs');
  assert.equal(await scalar('select count(*)::int value from program_shares'),0,'recipient cannot browse invitations');
  const preview=JSON.parse(await scalar('select preview_program_share($1)::text value',[code]));
  assert.equal(preview.name,'Shared sample');
  assert.equal(preview.workout_count,1);
  assert.equal(preview.already_accepted,false);
  const imported=await scalar('select accept_program_share($1) value',[code]);
  assert(imported && imported!==original);
  assert.equal(await scalar('select accept_program_share($1) value',[code]),imported,'repeat accept is idempotent');
  assert.equal(await scalar('select count(*)::int value from programs'),1);
  assert.equal(await scalar('select count(*)::int value from program_weeks'),1);
  assert.equal(await scalar('select count(*)::int value from program_workouts'),1);
  assert.equal(await scalar('select count(*)::int value from program_workout_exercises'),1);
  assert.equal(await scalar('select count(*)::int value from program_exercise_sets'),2);
  assert.equal(await scalar('select cycle_repeat_count value from programs where id=$1',[imported]),3);
  assert.equal(await scalar('select count(*)::int value from user_programs'),0,'accept does not start a workout program');
  await q("update programs set name='My edited copy' where id=$1",[imported]);

  await login(alice);
  assert.equal(await scalar('select name value from programs where id=$1',[original]),'Shared sample','recipient edits do not affect sender');
  await q('delete from program_shares where code=$1',[code]);
  await login(bob);
  await assert.rejects(q('select preview_program_share($1)',[code]),'revoked code cannot be previewed');
  await assert.rejects(q('select accept_program_share($1)',[code]),'revoked code cannot be accepted');

  // Issue #75: whoever received a program can read every exercise in it, and nothing else.
  const migration=read('../supabase/migrations/20261110120000_shared_program_exercise_access.sql');
  const programExercises=id=>q(`select pwe.exercise_id,pwe.exercise_name_snapshot from program_workout_exercises pwe
    join program_workouts w on w.id=pwe.workout_id join program_weeks pw on pw.id=w.week_id
    where pw.program_id=$1 order by pwe.position`,[id]);
  const programOf=exercises=>JSON.stringify({name:'Custom share',week_count:1,structure_mode:'cycle',cycle_repeat_count:1,schedule_mode:'custom',weeks:[{workouts:[{name:'Workout',rest_days_after:1,exercises}]}]});
  await db.exec('reset role');
  await db.exec(`insert into exercises(id,name,muscle_group,target_muscle,exercise_type,movement_type,technique,description,owner_id,video_path,photo_path,photo_paths) values
      ('${custom}','Комплекс на стопу','Ноги','Стопа','Пользовательское','Пользовательское','Катать мяч стопой','Без обуви','${alice}','${alice}/foot.mp4','${alice}/cover.jpg',array['${alice}/one.jpg']),
      ('${legacyNamed}','Старое своё','Ноги',null,'Пользовательское','Пользовательское','Техника',null,'${alice}',null,null,null),
      ('${secret}','Секретное','Ноги',null,'Пользовательское','Пользовательское','Тайна',null,'${alice}','${alice}/secret.mp4',null,null);
    insert into storage.objects values ('exercise-videos','${alice}/foot.mp4'),('exercise-videos','${alice}/secret.mp4'),
      ('exercise-photos','${alice}/cover.jpg'),('exercise-photos','${alice}/one.jpg'),('exercise-photos','${alice}/foot.mp4');`);

  await login(alice);
  const customProgram=await scalar('select create_program_with_schedule($1::jsonb) value',[programOf([{exercise_id:custom,exercise_name_snapshot:'Комплекс на стопу',sets:[{reps:10}]}])]);
  const customCode=await scalar('select create_program_share($1) value',[customProgram]);
  assert.equal(await scalar("select program_payload#>>'{weeks,0,workouts,0,exercises,0,exercise_id}' value from program_shares where code=$1",[customCode]),custom,'the payload keeps the private exercise ID');

  await login(bob);
  assert.equal(await scalar('select count(*)::int value from exercises where owner_id=$1',[alice]),0,'no access before accepting');
  assert.equal(await scalar('select count(*)::int value from storage.objects'),0);
  const received=await scalar('select accept_program_share($1) value',[customCode]);
  assert.deepEqual(await programExercises(received),[{exercise_id:custom,exercise_name_snapshot:'Комплекс на стопу'}]);
  assert.deepEqual(await q('select id,target_muscle,technique,description,video_path from exercises where owner_id=$1',[alice]),
    [{id:custom,target_muscle:'Стопа',technique:'Катать мяч стопой',description:'Без обуви',video_path:alice+'/foot.mp4'}],'recipient reads the shared exercise card, and only it');
  assert.deepEqual((await q('select bucket_id,name from storage.objects order by bucket_id,name')).map(r=>r.bucket_id+':'+r.name),
    ['exercise-photos:'+alice+'/cover.jpg','exercise-photos:'+alice+'/one.jpg','exercise-videos:'+alice+'/foot.mp4'],'recipient reads only the media of the shared exercise, each in its own bucket');
  assert.equal((await q("update exercises set name='Захват' where id=$1 returning id",[custom])).length,0,'read access does not allow editing');
  assert.equal((await q('delete from exercises where id=$1 returning id',[custom])).length,0,'read access does not allow deleting');
  assert.equal(await scalar('select count(*)::int value from exercise_catalog_v2 where id=$1',[custom]),0,'a shared exercise stays out of the recipient catalog');
  await assert.rejects(q('insert into exercise_access_grants(exercise_id,user_id) values($1,$2)',[secret,bob]),'grants cannot be written by users');
  // Pointing an own program row at a private ID gives nothing: access comes only from a grant.
  const probe=await scalar('select create_program_with_schedule($1::jsonb) value',[programOf([{exercise_id:secret,exercise_name_snapshot:'Проба',sets:[{reps:1}]}])]);
  assert(probe);
  assert.equal(await scalar('select count(*)::int value from exercises where id=$1',[secret]),0);

  // The recipient passes the program on: the next recipient gets the same exercise.
  const relayCode=await scalar('select create_program_share($1) value',[received]);
  // A forged invitation names an exercise its author cannot read.
  const forgedCode=await scalar('insert into program_shares(owner_id,source_program_id,program_payload) values($1,$2,$3::jsonb) returning code value',
    [bob,received,programOf([{exercise_id:secret,exercise_name_snapshot:'Секретное',sets:[{reps:1}]}])]);
  await login(carol);
  assert.equal(await scalar('select count(*)::int value from exercises where owner_id is not null'),0,'an outsider sees no private exercises');
  const relayed=await scalar('select accept_program_share($1) value',[relayCode]);
  assert.deepEqual(await programExercises(relayed),[{exercise_id:custom,exercise_name_snapshot:'Комплекс на стопу'}]);
  assert.equal(await scalar('select technique value from exercises where id=$1',[custom]),'Катать мяч стопой');
  const forged=await scalar('select accept_program_share($1) value',[forgedCode]);
  assert.deepEqual(await programExercises(forged),[{exercise_id:null,exercise_name_snapshot:'Секретное'}],'a forged link is dropped, the name stays');
  assert.equal(await scalar('select count(*)::int value from exercises where id=$1',[secret]),0,'a forged invitation grants nothing');

  // An invitation made before the fix carries only the name: accepting links it to the exercise of the sharer.
  await login(alice);
  const oldCode=await scalar('insert into program_shares(owner_id,source_program_id,program_payload) values($1,$2,$3::jsonb) returning code value',
    [alice,customProgram,programOf([{exercise_id:null,exercise_name_snapshot:'Старое своё',sets:[{reps:5}]}])]);
  await login(bob);
  const oldReceived=await scalar('select accept_program_share($1) value',[oldCode]);
  assert.deepEqual(await programExercises(oldReceived),[{exercise_id:legacyNamed,exercise_name_snapshot:'Старое своё'}]);
  assert.equal(await scalar('select technique value from exercises where id=$1',[legacyNamed]),'Техника');

  // Programs accepted before the fix: the migration relinks them, grants access and carries the
  // link into existing plans and workouts, except results already saved in the v2 format.
  await db.exec('reset role');
  const [template]=await q(`select pwe.id from program_workout_exercises pwe join program_workouts w on w.id=pwe.workout_id
    join program_weeks pw on pw.id=w.week_id where pw.program_id=$1`,[received]);
  const ids={sw:'40000000-0000-4000-8000-000000000001',swe:'40000000-0000-4000-8000-000000000002',session:'40000000-0000-4000-8000-000000000003',wse:'40000000-0000-4000-8000-000000000004',wseDone:'40000000-0000-4000-8000-000000000005',set:'40000000-0000-4000-8000-000000000006'};
  await db.exec(`set session_replication_role=replica;
    delete from exercise_access_grants;
    update program_workout_exercises set exercise_id=null where exercise_id in ('${custom}','${legacyNamed}');
    insert into scheduled_workout_exercises(id,scheduled_workout_id,source_program_workout_exercise_id,exercise_id,position,exercise_name_snapshot)
      values('${ids.swe}','${ids.sw}','${template.id}',null,1,'Комплекс на стопу');
    insert into workout_session_exercises(id,workout_session_id,source_scheduled_workout_exercise_id,exercise_id,position,exercise_name_snapshot) values
      ('${ids.wse}','${ids.session}','${ids.swe}',null,1,'Комплекс на стопу'),('${ids.wseDone}','${ids.session}','${ids.swe}',null,2,'Комплекс на стопу');
    insert into performed_sets(id,workout_session_exercise_id,set_number,result_v2) values('${ids.set}','${ids.wseDone}',1,'{}');
    set session_replication_role=origin;`);
  await login(bob);
  assert.equal(await scalar('select count(*)::int value from exercises where owner_id=$1',[alice]),0,'fixture: access is gone before the repair');
  await db.exec('reset role');
  await db.exec(migration);
  await db.exec(migration);
  assert.equal(await scalar('select exercise_id value from scheduled_workout_exercises where id=$1',[ids.swe]),custom);
  assert.equal(await scalar('select exercise_id value from workout_session_exercises where id=$1',[ids.wse]),custom);
  assert.equal(await scalar('select exercise_id value from workout_session_exercises where id=$1',[ids.wseDone]),null,'saved v2 results keep their exercise identity');
  await login(bob);
  assert.deepEqual(await programExercises(received),[{exercise_id:custom,exercise_name_snapshot:'Комплекс на стопу'}]);
  assert.deepEqual((await q('select id from exercises where owner_id=$1 order by id',[alice])).map(r=>r.id),[custom,legacyNamed]);
  await login(carol);
  assert.deepEqual((await q('select id from exercises where owner_id is not null')).map(r=>r.id),[custom],'the repair restores a relayed grant and nothing more');

  console.log('Program sharing passed: owner-only invitation, private preview, independent copy, idempotent acceptance, revocation, RLS and read access to the private exercises of a received program.');
} finally {await db.close();}
