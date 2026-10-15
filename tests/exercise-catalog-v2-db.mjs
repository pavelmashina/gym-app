import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

// Disposable PostgreSQL WASM instance. No network, credentials or production writes.
const db = new PGlite();
const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const migration = read('../supabase/migrations/20261015084238_exercise_catalog_v2_foundation.sql');
const alice = '10000000-0000-4000-8000-000000000001';
const bob = '10000000-0000-4000-8000-000000000002';
const shared = '20000000-0000-4000-8000-000000000001';
const privateId = '20000000-0000-4000-8000-000000000002';
const scalar = async sql => (await db.query(sql)).rows[0].n;
const reject = async (sql, code) => {
  await assert.rejects(db.exec(sql), e => e.code === code, sql);
};
try {
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
    create schema auth;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema public, auth to authenticated, anon, service_role;
    grant execute on function auth.uid() to authenticated, anon, service_role;
    insert into auth.users values ('${alice}'),('${bob}');
  `);
  await db.exec(read('../supabase/schema/exercises.sql'));
  await db.exec(`
    insert into exercises(id,name,muscle_group,exercise_type,movement_type,technique)
      values ('${shared}','Исходное название','Грудь','Силовое','Жим','Исходная техника');
    insert into exercises(id,name,muscle_group,exercise_type,movement_type,owner_id)
      values ('${privateId}','Личное упражнение','Ноги','Пользовательское','Пользовательское','${alice}');
    create table history_fixture(id integer primary key, exercise_id uuid references exercises(id) on delete restrict,
      weight numeric, reps integer, set_type text, note text, snapshot text);
    insert into history_fixture values (1,'${shared}',42.5,12,'warmup','Моя заметка','Старое имя');
  `);
  const oldColumns = (await db.query(`select column_name from information_schema.columns
    where table_schema='public' and table_name='exercises' order by ordinal_position`))
    .rows.map(row => '"' + row.column_name + '"').join(',');
  const before = (await db.query(`select ${oldColumns} from exercises order by id`)).rows;
  const historyBefore = (await db.query('select * from history_fixture')).rows;
  await db.exec(migration);
  await db.exec(migration);
  const machines = read('../supabase/migrations/20261015090011_exercise_machine_profiles.sql');
  await db.exec(machines);
  await db.exec(machines);
  assert.deepEqual((await db.query(`select ${oldColumns} from exercises order by id`)).rows, before);
  assert.deepEqual((await db.query('select * from history_fixture')).rows, historyBefore);
  assert.equal(await scalar("select count(*)::int n from exercises where status='legacy'"), 2);
  await db.exec(`update exercises set canonical_key='barbell_bench_press' where id='${shared}'`);
  await reject(`update exercises set canonical_key='renamed' where id='${shared}'`, '23514');
  await reject(`update exercises set id=gen_random_uuid() where id='${shared}'`, '23514');
  await reject(`update exercises set status='published' where id='${shared}'`, '23514');
  await reject(`update exercises set mechanics='invented' where id='${shared}'`, '23514');
  await db.exec(`
    insert into exercise_aliases(exercise_id,alias,language,alias_type) values
      ('${shared}','Bench Press','en','translation'),
      ('${privateId}','Private alias','en','synonym');
    insert into exercise_relations values ('${shared}','${privateId}','alternative_to');
  `);
  await reject(`insert into exercise_aliases(exercise_id,alias,language,alias_type)
    values ('${shared}',' bench press ','en','synonym')`, '23505');
  await reject(`insert into exercise_relations values ('${shared}','${shared}','variant_of')`, '23514');
  await reject(`insert into exercise_legacy_mappings(legacy_source,legacy_exercise_id,legacy_name,review_status)
    values ('source','row1','unknown','confirmed')`, '23514');
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${bob}',false)`);
  assert.equal(await scalar('select count(*)::int n from exercises'), 1);
  assert.equal(await scalar('select count(*)::int n from exercise_aliases'), 1);
  assert.equal(await scalar('select count(*)::int n from exercise_relations'), 0);
  assert.equal((await db.query(`update exercises set name='stolen' where id='${privateId}' returning id`)).rows.length, 0);
  await reject(`insert into exercise_aliases(exercise_id,alias,language,alias_type)
    values ('${shared}','unauthorized','en','synonym')`, '42501');
  await reject('select * from exercise_legacy_mappings', '42501');
  await db.exec(`select set_config('request.jwt.claim.sub','${alice}',false)`);
  assert.equal(await scalar('select count(*)::int n from exercises'), 2);
  assert.equal(await scalar('select count(*)::int n from exercise_aliases'), 2);
  assert.equal(await scalar('select count(*)::int n from exercise_relations'), 1);
  await db.exec(`update exercises set name='Личное переименовано' where id='${privateId}'`);
  assert.equal((await db.query(`select canonical_key from exercises where id='${privateId}'`)).rows[0].canonical_key,
    'user_' + privateId.replaceAll('-',''));
  await reject(`update exercises set owner_id='${bob}' where id='${privateId}'`, '42501');
  await reject(`update exercises set owner_id=null where id='${privateId}'`, '42501');
  await reject(`update exercises set status='published' where id='${privateId}'`, '23514');
  // Legacy create flow still works without supplying any v2 field.
  await db.exec(`insert into exercises(name,muscle_group,exercise_type,movement_type,owner_id)
    values ('Новое личное','Грудь','Пользовательское','Пользовательское','${alice}')`);
  await db.exec('reset role; set role anon');
  await reject('select * from exercise_aliases', '42501');
  await db.exec('reset role');
  const profile = '30000000-0000-4000-8000-000000000001';
  const instance = '30000000-0000-4000-8000-000000000002';
  const configuration = '30000000-0000-4000-8000-000000000003';
  await db.exec(`insert into machine_profiles(id,code,name_ru,machine_category,loading_mechanism)
    values ('${profile}','test_press','Тестовый профиль','selectorized','stack');
    insert into exercise_machine_profiles values ('${shared}','${profile}');
    set role authenticated; select set_config('request.jwt.claim.sub','${alice}',false);
    insert into equipment_instances(id,owner_user_id,machine_profile_id,custom_name)
      values ('${instance}','${alice}','${profile}','Мой тренажёр');
    insert into exercise_configurations(id,owner_user_id,exercise_id,equipment_instance_id,name,bench_angle_degrees)
      values ('${configuration}','${alice}','${shared}','${instance}','Мои настройки',30);`);
  await reject(`update equipment_instances set owner_user_id='${bob}' where id='${instance}'`, '23514');
  await reject(`update exercise_configurations set owner_user_id='${bob}' where id='${configuration}'`, '23514');
  await reject(`update exercise_configurations set bench_angle_degrees=999 where id='${configuration}'`, '23514');
  await db.exec(`select set_config('request.jwt.claim.sub','${bob}',false)`);
  assert.equal(await scalar('select count(*)::int n from equipment_instances'), 0);
  assert.equal(await scalar('select count(*)::int n from exercise_configurations'), 0);
  assert.equal((await db.query(`delete from equipment_instances where id='${instance}' returning id`)).rows.length, 0);
  await reject(`insert into equipment_instances(owner_user_id,machine_profile_id,custom_name)
    values ('${alice}','${profile}','Чужой')`, '42501');
  await reject(`insert into exercise_configurations(owner_user_id,exercise_id,equipment_instance_id,name)
    values ('${bob}','${shared}','${instance}','Чужой тренажёр')`, '23514');
  await reject(`insert into exercise_configurations(owner_user_id,exercise_id,name)
    values ('${bob}','${privateId}','Чужое упражнение')`, '42501');
  await db.exec(`select set_config('request.jwt.claim.sub','${alice}',false);
    update equipment_instances set custom_name='Новое название' where id='${instance}';
    delete from exercise_configurations where id='${configuration}';
    delete from equipment_instances where id='${instance}';
    reset role; set role anon;`);
  await reject('select * from equipment_instances','42501');
  await reject('select * from exercise_configurations','42501');
  await db.exec('reset role');
  assert.deepEqual((await db.query('select * from history_fixture')).rows, historyBefore);
  const insecure = (await db.query(`select relname from pg_class where relnamespace='public'::regnamespace
    and relkind='r' and relname <> 'history_fixture' and not relrowsecurity`)).rows;
  assert.deepEqual(insecure, []);
  console.log('Catalog v2 DB: both migrations repeatable; legacy preservation, identities, publication gate, constraints and two-user RLS for catalog/machines/configurations passed.');
} finally {
  await db.close();
}
