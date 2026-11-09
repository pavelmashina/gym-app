import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

// Disposable PostgreSQL WASM instance. No network, credentials or production writes.
const db = new PGlite();
const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const alice = '10000000-0000-4000-8000-000000000001';
const bob = '10000000-0000-4000-8000-000000000002';
const used = '20000000-0000-4000-8000-000000000001';
const unused = '20000000-0000-4000-8000-000000000002';
const count = async sql => (await db.query(sql)).rows[0].n;
const rejectsWith = (sql, ...codes) => assert.rejects(db.exec(sql), error => codes.includes(error.code), sql);
const actAs = user => db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${user}',false)`);

// Every layer that keeps results or plans must block a hard delete of the exercise it references.
for (const [file, table] of [['program-core', 'program_workout_exercises'], ['program-enrollment', 'scheduled_workout_exercises'], ['workout-session', 'workout_session_exercises']]) {
  const schema = read(`../supabase/schema/${file}.sql`);
  const definition = schema.slice(schema.indexOf(`create table if not exists public.${table}`));
  assert.match(definition.slice(0, definition.indexOf(');')), /exercise_id uuid not null references public\.exercises\(id\) on delete restrict/, table);
}
// Shared programs never carry a private exercise ID, so no other user can hold a reference.
assert.match(read('../supabase/schema/program-sharing.sql'), /'exercise_id',case when ex\.owner_id is null then pwe\.exercise_id else null end/);

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
    create function public.adopt_catalog_program(p_catalog_program_id uuid) returns uuid language plpgsql as $$
    declare v_name text; begin return public.resolve_catalog_exercise(v_name); end $$;
  `);
  for (const file of ['20261015084238_exercise_catalog_v2_foundation.sql', '20261015090011_exercise_machine_profiles.sql', '20261015094158_exercise_catalog_v2_api.sql']) {
    await db.exec(read(`../supabase/migrations/${file}`));
  }
  await db.exec(`
    insert into exercises(id,name,muscle_group,exercise_type,movement_type,owner_id) values
      ('${used}','Жим из истории','Грудь','Пользовательское','Пользовательское','${alice}'),
      ('${unused}','Неиспользованное','Ноги','Пользовательское','Пользовательское','${alice}');
    create table history_fixture(id integer primary key, exercise_id uuid references exercises(id) on delete restrict, weight numeric);
    insert into history_fixture values (1,'${used}',42.5);
    alter table history_fixture enable row level security;
    grant select on history_fixture to authenticated;
    create policy history_read on history_fixture for select to authenticated using (true);
  `);

  // Another user can neither see nor change the exercise, through the table or the catalog view.
  await actAs(bob);
  assert.equal(await count(`select count(*)::int n from exercises where id in ('${used}','${unused}')`), 0);
  assert.equal(await count(`select count(*)::int n from exercise_catalog_v2 where id in ('${used}','${unused}')`), 0);
  const changed = await db.query(`update exercises set name='Захват', status='retired' where id='${used}' returning id`);
  assert.equal(changed.rows.length, 0);
  const removed = await db.query(`delete from exercises where id='${unused}' returning id`);
  assert.equal(removed.rows.length, 0);
  await rejectsWith(`insert into exercises(name,muscle_group,exercise_type,movement_type,owner_id)
    values ('Подмена','Грудь','Свой','Свой','${alice}')`, '42501');

  // The owner cannot hard-delete a used exercise: the result rows are protected by the database.
  await actAs(alice);
  assert.equal(await count(`select count(*)::int n from exercises where id in ('${used}','${unused}')`), 2);
  await rejectsWith(`delete from exercises where id='${used}'`, '23503', '23001');
  assert.equal(await count(`select count(*)::int n from history_fixture where exercise_id='${used}' and weight=42.5`), 1);

  // Retiring needs no schema change, cannot publish, and leaves the name readable for history.
  await db.exec(`update exercises set status='retired' where id='${used}'`);
  await rejectsWith(`update exercises set status='published' where id='${unused}'`, '23514');
  const history = await db.query(`select e.name, e.status, h.weight from history_fixture h join exercises e on e.id=h.exercise_id`);
  assert.deepEqual(history.rows, [{ name: 'Жим из истории', status: 'retired', weight: '42.5' }]);
  // The view still returns it to its owner, so the client has to filter it out of the pickers.
  assert.equal(await count(`select count(*)::int n from exercise_catalog_v2 where id='${used}'`), 1);

  // An unused exercise really goes away.
  await db.exec(`delete from exercises where id='${unused}'`);
  assert.equal(await count(`select count(*)::int n from exercises where id='${unused}'`), 0);

  // A retired exercise stays private from everyone else.
  await actAs(bob);
  assert.equal(await count(`select count(*)::int n from exercises where id='${used}'`), 0);
  await db.exec('reset role');
} finally {
  await db.close();
}
console.log('My exercises database: owner isolation, restricted delete and retirement verified.');
