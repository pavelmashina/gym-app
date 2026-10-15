import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {buildCatalogSeed,catalogRecords} from '../scripts/exercise-catalog-seed.mjs';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const legacy=JSON.parse(read('../docs/exercise-catalog-v2/legacy-shared-catalog.json'));
const db=new PGlite();
const scalar=async sql=>(await db.query(sql)).rows[0].n;
try{
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
    create schema auth;create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema public,auth to authenticated,anon,service_role;`);
  await db.exec(read('../supabase/schema/exercises.sql'));
  for(const row of legacy)await db.query(`insert into exercises(id,name,muscle_group,exercise_type,movement_type,technique,equipment)
    values($1,$2,$3,$4,$5,$6,$7)`,[row.id,row.name,row.muscle_group,row.exercise_type,row.movement_type,row.technique,row.equipment]);
  await db.exec(`create table protected_history(id integer primary key,exercise_id uuid references exercises(id) on delete restrict,weight numeric,reps integer,note text);
    insert into protected_history values(1,'${legacy[0].id}',42,10,'Исходная заметка');
    create function public.adopt_catalog_program(p_catalog_program_id uuid) returns uuid language plpgsql as $$
    declare v_name text:='test'; v_exercise_id uuid; begin
      select e.id into v_exercise_id from public.exercises e where lower(btrim(e.name))=lower(v_name) order by e.id limit 1;
      return v_exercise_id; end $$;`);
  for(const file of ['20261015084238_exercise_catalog_v2_foundation.sql','20261015090011_exercise_machine_profiles.sql','20261015094158_exercise_catalog_v2_api.sql']){
    await db.exec(read('../supabase/migrations/'+file));await db.exec(read('../supabase/migrations/'+file));
  }
  const history=(await db.query('select * from protected_history')).rows;
  const before=(await db.query('select id from exercises order by id')).rows;
  const sql=buildCatalogSeed();await db.exec(sql);await db.exec(sql);
  assert.equal(await scalar('select count(*)::int n from exercise_legacy_mappings'),436);
  assert.equal(await scalar("select count(*)::int n from exercise_legacy_mappings where review_status='confirmed'"),21);
  assert.equal(await scalar('select count(*)::int n from exercises'),524);
  assert.equal(await scalar("select count(*)::int n from exercises where status='review'"),88);
  await db.exec('set role authenticated');
  assert.equal(await scalar('select count(*)::int n from exercises'),436,'Review staging must not hide existing history IDs');
  await db.exec('reset role');
  assert.equal(await scalar('select count(*)::int n from exercise_catalog_v2'),0);
  await db.exec(buildCatalogSeed({publish:true}));
  await db.exec(buildCatalogSeed({publish:true}));
  assert.equal(await scalar('select count(*)::int n from exercise_catalog_v2'),109);
  assert.equal(await scalar("select count(*)::int n from exercise_catalog_v2 where measurement_note is not null and target_muscle is not null"),109);
  const ids=new Set((await db.query('select id from exercises')).rows.map(x=>x.id));
  for(const row of before)assert(ids.has(row.id));
  assert.deepEqual((await db.query('select * from protected_history')).rows,history);
  const plank=catalogRecords.find(x=>x.canonical_key==='forearm_plank');
  assert.equal((await db.query("select resolve_catalog_exercise('Планка на локтях') id")).rows[0].id,plank.id);
  assert.equal((await db.query("select resolve_catalog_exercise('Суперсет:') id")).rows[0].id,null);
  await assert.rejects(db.exec(`update exercises set technique_cues='{}' where id='${plank.id}'`),e=>e.code==='23514');
  await assert.rejects(db.exec(`delete from exercise_muscles where exercise_id='${plank.id}'`),e=>e.code==='23514');
  await assert.rejects(db.exec(`delete from exercise_aliases where exercise_id='${plank.id}' and language='en'`),e=>e.code==='23514');
  await db.exec('set role authenticated');
  assert.equal(await scalar('select count(*)::int n from exercise_catalog_v2'),109);
  assert.equal((await db.query(`update exercises set name='unauthorized' where id='${plank.id}' returning id`)).rows.length,0);
  await db.exec('reset role;set role anon');
  await assert.rejects(db.exec('select * from exercise_catalog_v2'),e=>e.code==='42501');
  console.log('Seed/API: 109 cards, 524 total with legacy retained, idempotent seed/publish, validation gates and invoker view passed.');
}finally{await db.close();}
