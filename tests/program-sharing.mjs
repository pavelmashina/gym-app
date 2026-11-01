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
    insert into auth.users values('${alice}'),('${bob}');`);
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

  console.log('Program sharing passed: owner-only invitation, private preview, independent copy, idempotent acceptance, revocation and RLS.');
} finally {await db.close();}
