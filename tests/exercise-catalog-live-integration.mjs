import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {buildCatalogSeed,catalogRecords} from '../scripts/exercise-catalog-seed.mjs';
import {buildCatalogRelease} from '../scripts/exercise-catalog-release.mjs';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const schema=JSON.parse(read('./fixtures/catalog-live-schema-20261015.json'));
const legacy=JSON.parse(read('../docs/exercise-catalog-v2/legacy-shared-catalog.json'));
const quote=s=>'"'+s.replaceAll('"','""')+'"';
const db=new PGlite();
const alice='00000000-0000-4000-8000-000000000001',bob='00000000-0000-4000-8000-000000000002';
const query=async(sql,args=[])=>(await db.query(sql,args)).rows;
const scalar=async(sql,args=[])=>(await query(sql,args))[0]?.value;
const login=async id=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role authenticated');};
try {
  // Actual schema-only snapshot; auth identities and workout data below are synthetic.
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
    create schema auth;create schema private;create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema public,auth to authenticated,anon,service_role;
    insert into auth.users values('${alice}'),('${bob}');`);
  for(const t of schema.tables)await db.exec(t.ddl);
  for(const c of [...schema.constraints].sort((a,b)=>Number(a.foreign)-Number(b.foreign)))await db.exec(c.sql);
  for(const sql of schema.indexes)await db.exec(sql);
  for(const f of schema.functions)await db.exec(f.sql);
  for(const sql of schema.triggers)await db.exec(sql);
  for(const p of schema.policies)await db.exec(`create policy ${quote(p.name)} on public.${quote(p.table)} as ${p.permissive} for ${p.cmd} to ${p.roles.map(quote).join(',')} ${p.qual?'using ('+p.qual+')':''} ${p.check?'with check ('+p.check+')':''}`);
  for(const t of schema.tables)if(t.rls)await db.exec(`alter table public.${quote(t.name)} enable row level security`);
  for(const g of schema.grants)await db.exec(`grant ${g.privilege} on public.${quote(g.table)} to ${quote(g.role)}`);
  for(const e of legacy)await db.query('insert into exercises(id,name,muscle_group,exercise_type,movement_type,technique,equipment) values($1,$2,$3,$4,$5,$6,$7)',[e.id,e.name,e.muscle_group,e.exercise_type,e.movement_type,e.technique,e.equipment]);
  // Save a complete legacy workout BEFORE migration, including note and name snapshot.
  const payload=exercises=>({name:'Integration fixture',week_count:1,weeks:[{workouts:[{name:'Test workout',exercises}]}]});
  const create=async exercises=>scalar('select create_program_with_schedule($1::jsonb) value',[JSON.stringify(payload(exercises))]);
  const start=async program=>{
    const participation=await scalar('select start_program($1,current_date) value',[program]);
    const scheduled=await scalar('select id value from scheduled_workouts where user_program_id=$1',[participation]);
    const session=await scalar('select start_workout($1) value',[scheduled]);
    return {participation,scheduled,session};
  };
  await login(alice);
  const old=await start(await create([{exercise_id:legacy[0].id,name:'Historical name',sets:[{reps:10}]}]));
  await db.query("update performed_sets set weight=42,reps=10,completed=true,completed_at=now() where workout_session_exercise_id in(select id from workout_session_exercises where workout_session_id=$1)",[old.session]);
  await db.query("update workout_session_exercises set note='Original note' where workout_session_id=$1",[old.session]);
  await db.query('select complete_workout($1)',[old.session]);
  const history=await query('select s.*,e.note,e.exercise_id,e.exercise_name_snapshot from performed_sets s join workout_session_exercises e on e.id=s.workout_session_exercise_id');
  await db.exec('reset role');
  const release=buildCatalogRelease({publish:true});
  // A late failure must roll back every migration and all seed changes together.
  await assert.rejects(db.exec(release.replace(/commit;\s*$/,"select 1/0; commit;")),e=>e.code==='22012');
  await db.exec('rollback;');
  assert.equal(await scalar("select count(*)::int value from information_schema.columns where table_schema='public' and table_name='exercises' and column_name='canonical_key'"),0);
  assert.equal(await scalar('select count(*)::int value from exercises'),436);
  assert.deepEqual(await query('select s.*,e.note,e.exercise_id,e.exercise_name_snapshot from performed_sets s join workout_session_exercises e on e.id=s.workout_session_exercise_id'),history);
  await db.exec(release);
  await db.exec(release);
  assert.equal(await scalar('select count(*)::int value from private.exercise_catalog_v1_archive'),436);
  await db.exec(buildCatalogSeed({publish:true}));
  await login(alice);
  const after=await query('select s.*,e.note,e.exercise_id,e.exercise_name_snapshot from performed_sets s join workout_session_exercises e on e.id=s.workout_session_exercise_id');
  assert.deepEqual(after.map(({result_v2,result_equipment_instance_id,...rest})=>rest),history);
  for(const row of legacy)assert.equal(await scalar('select resolve_catalog_exercise($1) value',[row.name]),row.id,`Lost original name: ${row.name}`);
  const cardio=(await query("insert into exercises(owner_id,name,muscle_group,exercise_type,movement_type,measurement_type,load_mode,laterality) values($1,'Synthetic cardio','Кардио','Базовое','Кардио','cardio','none','bilateral') returning *",[alice]))[0];
  const cards=[...['weight_reps','bodyweight_reps','assisted_reps','duration','carry'].map(type=>catalogRecords.find(e=>e.measurement_type===type&&e.laterality==='bilateral')),cardio];
  assert(cards.every(Boolean));
  const run=await start(await create(cards.map(e=>({exercise_id:e.id,name:e.name,sets:[{reps:8}]}))));
  const sets=await query('select s.id,e.id as session_exercise_id,e.exercise_id from performed_sets s join workout_session_exercises e on e.id=s.workout_session_exercise_id where e.workout_session_id=$1 order by e.position',[run.session]);
  const metrics=[{weight:40,reps:8},{reps:8},{assistance_weight:25,reps:8},{duration_seconds:45},{weight:20,distance_meters:30},{duration_seconds:300,distance_meters:1000}];
  for(let i=0;i<cards.length;i++){
    const e=cards[i];const result={metric_version:'v2',exercise_id:e.id,measurement_type:e.measurement_type,load_mode:e.load_mode,laterality:e.laterality,weight_unit:'kg',configuration_key:'standard',set_type:'working',completed:true,...metrics[i]};
    await db.query('update performed_sets set weight=null,reps=null,completed=true,completed_at=now(),result_v2=$1 where id=$2',[JSON.stringify(result),sets[i].id]);
  }
  await assert.rejects(db.query('update workout_session_exercises set exercise_id=$1 where id=$2',[cards[1].id,sets[0].session_exercise_id]),e=>e.code==='23514');
  await db.query('select reorder_workout_session_exercises($1,$2::uuid[])',[run.session,sets.map(s=>s.session_exercise_id).reverse()]);
  await db.query('select pause_workout($1)',[run.scheduled]);
  await db.query('select resume_workout($1)',[run.scheduled]);
  await login(bob);
  assert.equal(await scalar('select count(*)::int value from performed_sets'),0);
  await assert.rejects(db.query('select complete_workout($1)',[run.session]));
  assert.equal((await query('update performed_sets set completed=false where id=$1 returning id',[sets[0].id])).length,0);
  await login(alice);
  await db.query('select complete_workout($1)',[run.session]);
  assert.equal(await scalar('select status value from user_programs where id=$1',[run.participation]),'completed');
  assert.equal(await scalar('select count(*)::int value from performed_sets where result_v2 is not null and completed and weight is null and reps is null'),6);
  // Real import RPC now resolves an English alias, while preserving an unresolved source name.
  await db.exec('reset role');
  const catalog=await scalar("insert into catalog_programs(name,source_key,source_payload) values('Import fixture','integration-fixture',$1) returning id value",[JSON.stringify({cycle:{workouts:[{name:'Import',exercises:[{name:'Forearm Plank'},{name:'Unresolved fixture name'}]}]}})]);
  await login(alice);
  const adopted=await scalar('select adopt_catalog_program($1) value',[catalog]);
  const imported=await query('select e.exercise_id,e.exercise_name_snapshot from program_workout_exercises e join program_workouts w on w.id=e.workout_id join program_weeks pw on pw.id=w.week_id where pw.program_id=$1 order by e.position',[adopted]);
  assert.equal(imported[0].exercise_id,catalogRecords.find(e=>e.canonical_key==='forearm_plank').id);
  assert.equal(imported[1].exercise_id,null);assert.equal(imported[1].exercise_name_snapshot,'Unresolved fixture name');
  assert.equal(await scalar('select adopt_catalog_program($1) value',[catalog]),adopted);
  const sourceNames=JSON.parse(read('../docs/exercise-catalog-v2/program-source-names.json'));
  const sourceExercises=sourceNames.flatMap(row=>(row.prescriptions.length?row.prescriptions:['']).map(prescription=>({name:row.name,prescription})));
  await db.exec('reset role');
  const allNamesCatalog=await scalar("insert into catalog_programs(name,source_key,source_payload) values('All source names','all-source-names-fixture',$1) returning id value",[JSON.stringify({cycle:{workouts:[{name:'All source names',exercises:sourceExercises}]}})]);
  await login(alice);
  const allNamesProgram=await scalar('select adopt_catalog_program($1) value',[allNamesCatalog]);
  const snapshots=await query('select e.exercise_name_snapshot,e.prescription_snapshot,e.exercise_id from program_workout_exercises e join program_workouts w on w.id=e.workout_id join program_weeks pw on pw.id=w.week_id where pw.program_id=$1 order by e.position',[allNamesProgram]);
  assert.equal(snapshots.length,sourceExercises.length);
  for(let i=0;i<snapshots.length;i++){
    assert.equal(snapshots[i].exercise_name_snapshot,sourceExercises[i].name.trim());
    assert.equal(snapshots[i].prescription_snapshot,sourceExercises[i].prescription.trim()||null);
    assert.equal(snapshots[i].exercise_id,await scalar('select resolve_catalog_exercise($1) value',[sourceExercises[i].name]));
  }
  console.log(`Source compatibility: all 436 original names resolve to original UUIDs; all 376 program names and ${sourceExercises.length} name/prescription pairs imported without text loss. Unresolved names remain explicit snapshots.`);
  console.log('Live-schema integration passed: legacy preservation, create/import/start, 6 metrics, reorder, pause/resume/complete, owner isolation. No production data written.');
} finally {await db.close();}
