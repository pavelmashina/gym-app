-- Issue #75: a program received from another user showed its custom exercises as empty cards.
-- The share payload dropped the ID of every private exercise, and nobody but the owner could
-- read such a row or its media.
--
-- Rule: whoever received a program can read every exercise in it.
--   * The share payload keeps the ID of each exercise the sharer can read.
--   * Accepting a share writes one row per private exercise into exercise_access_grants. Only
--     the accept function writes there, so a grant cannot be forged by pointing a program row
--     at somebody's exercise ID.
--   * A grant gives read access to the exercise row and to its video and photos. Editing and
--     deleting stay with the owner. Granted exercises do not enter the recipient's catalog or
--     «Мои упражнения»: exercise_catalog_v2 lists only published and own rows.
--   * The received program is still an independent copy. It follows later edits of the exercise
--     card itself, because it reads the card by ID.
-- Programs accepted before this migration are repaired at the end of the file.

create table if not exists public.exercise_access_grants (
  exercise_id uuid not null references public.exercises(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  share_code uuid references public.program_shares(code) on delete set null,
  granted_at timestamptz not null default now(),
  primary key (exercise_id, user_id)
);
create index if not exists exercise_access_grants_user_idx on public.exercise_access_grants(user_id);
alter table public.exercise_access_grants enable row level security;
revoke all on public.exercise_access_grants from public, anon, authenticated;
grant select on public.exercise_access_grants to authenticated;
grant all on public.exercise_access_grants to service_role;
drop policy if exists exercise_access_grants_select_own on public.exercise_access_grants;
create policy exercise_access_grants_select_own on public.exercise_access_grants
for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists exercises_read_shared_program on public.exercises;
create policy exercises_read_shared_program on public.exercises
for select to authenticated
using (
  owner_id is not null
  and exists (
    select 1 from public.exercise_access_grants g
    where g.exercise_id = exercises.id and g.user_id = (select auth.uid())
  )
);

drop policy if exists exercise_videos_select_shared_program on storage.objects;
create policy exercise_videos_select_shared_program on storage.objects
for select to authenticated
using (
  bucket_id = 'exercise-videos'
  and exists (
    select 1 from public.exercise_access_grants g
    join public.exercises e on e.id = g.exercise_id
    where g.user_id = (select auth.uid()) and e.video_path = objects.name
  )
);

drop policy if exists exercise_photos_select_shared_program on storage.objects;
create policy exercise_photos_select_shared_program on storage.objects
for select to authenticated
using (
  bucket_id = 'exercise-photos'
  and exists (
    select 1 from public.exercise_access_grants g
    join public.exercises e on e.id = g.exercise_id
    where g.user_id = (select auth.uid())
      and (e.photo_path = objects.name or objects.name = any(e.photo_paths))
  )
);

-- This runs as the authenticated owner, respecting all existing program RLS policies.
create or replace function public.create_program_share(p_program_id uuid)
returns uuid language plpgsql security invoker set search_path = ''
as $$
declare
  v_program public.programs%rowtype;
  v_payload jsonb;
  v_code uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
  select * into v_program from public.programs
    where id=p_program_id and owner_id=auth.uid() and status <> 'archived';
  if not found then raise exception 'Only the program owner can share it' using errcode='42501'; end if;

  select pg_catalog.jsonb_build_object(
    'name',v_program.name,
    'description',v_program.description,
    'week_count',v_program.week_count,
    'structure_mode',v_program.structure_mode,
    'cycle_repeat_count',v_program.cycle_repeat_count,
    'categories',pg_catalog.to_jsonb(v_program.categories),
    'training_place',v_program.training_place,
    'equipment',v_program.equipment,
    'level',v_program.level,
    'schedule_mode',v_program.schedule_mode,
    'weeks',coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'workouts',coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'name',w.name,
                'rest_days_after',w.rest_days_after,
                'exercises',coalesce((
                  select jsonb_agg(
                    jsonb_build_object(
                      -- ex.id is null when the sharer cannot read the exercise themself.
                      'exercise_id',ex.id,
                      'exercise_name_snapshot',coalesce(nullif(pwe.exercise_name_snapshot,''),ex.name),
                      'prescription_snapshot',pwe.prescription_snapshot,
                      'sets',coalesce((
                        select jsonb_agg(jsonb_build_object('reps',s.reps) order by s.set_number)
                        from public.program_exercise_sets s where s.workout_exercise_id=pwe.id
                      ),'[]'::jsonb)
                    ) order by pwe.position
                  )
                  from public.program_workout_exercises pwe
                  left join public.exercises ex on ex.id=pwe.exercise_id
                  where pwe.workout_id=w.id
                ),'[]'::jsonb)
              ) order by w.position
            ) from public.program_workouts w where w.week_id=pw.id
          ),'[]'::jsonb)
        ) order by pw.position
      ) from public.program_weeks pw where pw.program_id=v_program.id
    ),'[]'::jsonb)
  ) into v_payload;
  if pg_catalog.jsonb_array_length(v_payload->'weeks')=0 then
    raise exception 'Cannot share an empty program' using errcode='22023';
  end if;
  insert into public.program_shares(owner_id,source_program_id,program_payload)
  values(auth.uid(),p_program_id,v_payload) returning code into v_code;
  return v_code;
end;
$$;
revoke all on function public.create_program_share(uuid) from public,anon,authenticated;
grant execute on function public.create_program_share(uuid) to authenticated;

-- Gives the recipient read access to the private exercises of a program they received.
-- program_shares rows are inserted by their owner directly, so the payload is not trusted:
-- access is granted only to exercises the sharer owns or was granted.
create or replace function sharing_private.grant_shared_program_exercises(
  p_program_id uuid, p_sharer_id uuid, p_recipient_id uuid, p_share_code uuid
)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  -- Payloads made before issue #75 carry only the name of a private exercise: link it to the
  -- exercise of that name the sharer owns or, for a program passed on, was granted.
  update public.program_workout_exercises pwe
  set exercise_id = (
    select e.id from public.exercises e
    where (
        e.owner_id = p_sharer_id
        or (e.owner_id is not null and exists (
          select 1 from public.exercise_access_grants g
          where g.exercise_id = e.id and g.user_id = p_sharer_id
        ))
      )
      and lower(btrim(e.name)) = lower(btrim(pwe.exercise_name_snapshot))
    order by (e.owner_id <> p_sharer_id), (e.status = 'retired'), e.created_at, e.id
    limit 1
  )
  where pwe.exercise_id is null
    and pwe.workout_id in (
      select w.id from public.program_workouts w
      join public.program_weeks pw on pw.id = w.week_id
      where pw.program_id = p_program_id
    )
    and exists (
      select 1 from public.exercises e
      where (
        e.owner_id = p_sharer_id
        or (e.owner_id is not null and exists (
          select 1 from public.exercise_access_grants g
          where g.exercise_id = e.id and g.user_id = p_sharer_id
        ))
      )
        and lower(btrim(e.name)) = lower(btrim(pwe.exercise_name_snapshot))
    );

  insert into public.exercise_access_grants(exercise_id, user_id, share_code)
  select distinct e.id, p_recipient_id, p_share_code
  from public.program_workout_exercises pwe
  join public.program_workouts w on w.id = pwe.workout_id
  join public.program_weeks pw on pw.id = w.week_id
  join public.exercises e on e.id = pwe.exercise_id
  where pw.program_id = p_program_id
    and e.owner_id is not null
    and e.owner_id <> p_recipient_id
    and (
      e.owner_id = p_sharer_id
      or exists (
        select 1 from public.exercise_access_grants g
        where g.exercise_id = e.id and g.user_id = p_sharer_id
      )
    )
  on conflict (exercise_id, user_id) do nothing;

  -- A forged payload may name a private exercise the sharer has no right to pass on.
  -- Such a row keeps its name and loses the link.
  update public.program_workout_exercises pwe
  set exercise_id = null,
      exercise_name_snapshot = coalesce(nullif(btrim(pwe.exercise_name_snapshot),''),'Упражнение')
  from public.exercises e
  where e.id = pwe.exercise_id
    and pwe.workout_id in (
      select w.id from public.program_workouts w
      join public.program_weeks pw on pw.id = w.week_id
      where pw.program_id = p_program_id
    )
    and e.owner_id is not null
    and e.owner_id <> p_recipient_id
    and not exists (
      select 1 from public.exercise_access_grants g
      where g.exercise_id = e.id and g.user_id = p_recipient_id
    );
end;
$$;
revoke all on function sharing_private.grant_shared_program_exercises(uuid,uuid,uuid,uuid) from public,anon,authenticated;

-- Atomic and idempotent import: each recipient gets their own editable program.
create or replace function sharing_private.accept_program_share(p_code uuid)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  v_share public.program_shares%rowtype;
  v_existing uuid;
  v_new_program uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
  select * into v_share from public.program_shares
    where code=p_code and revoked_at is null and expires_at>now()
    for update;
  if not found then raise exception 'Invitation not found or expired' using errcode='P0002'; end if;
  if v_share.owner_id=auth.uid() then raise exception 'Cannot accept your own invitation' using errcode='22023'; end if;
  select received_program_id into v_existing from public.program_share_receipts
    where share_code=p_code and recipient_id=auth.uid();
  if v_existing is not null then return v_existing; end if;
  v_new_program:=public.create_program_with_schedule(v_share.program_payload);
  perform sharing_private.grant_shared_program_exercises(v_new_program,v_share.owner_id,auth.uid(),p_code);
  insert into public.program_share_receipts(share_code,recipient_id,received_program_id)
    values(p_code,auth.uid(),v_new_program)
    on conflict (share_code,recipient_id)
    do update set received_program_id=excluded.received_program_id,accepted_at=now();
  return v_new_program;
end;
$$;
revoke all on function sharing_private.accept_program_share(uuid) from public,anon,authenticated;
grant execute on function sharing_private.accept_program_share(uuid) to authenticated;

-- Repair programs accepted before this migration: link their private exercises by name and
-- grant access, then carry the link into the plans and workouts already made from them.
do $$
declare
  v_receipt record;
begin
  for v_receipt in
    select r.received_program_id, r.recipient_id, s.owner_id, s.code
    from public.program_share_receipts r
    join public.program_shares s on s.code = r.share_code
    where r.received_program_id is not null
    -- Oldest first: a program passed on is repaired after the one it was copied from.
    order by r.accepted_at
  loop
    perform sharing_private.grant_shared_program_exercises(
      v_receipt.received_program_id, v_receipt.owner_id, v_receipt.recipient_id, v_receipt.code
    );
  end loop;
end;
$$;

update public.scheduled_workout_exercises swe
set exercise_id = pwe.exercise_id
from public.program_workout_exercises pwe
join public.program_workouts w on w.id = pwe.workout_id
join public.program_weeks pw on pw.id = w.week_id
join public.program_share_receipts r on r.received_program_id = pw.program_id
where swe.source_program_workout_exercise_id = pwe.id
  and swe.exercise_id is null
  and pwe.exercise_id is not null;

-- Results already saved in the v2 format keep their exercise identity untouched.
update public.workout_session_exercises wse
set exercise_id = swe.exercise_id
from public.scheduled_workout_exercises swe
join public.program_workout_exercises pwe on pwe.id = swe.source_program_workout_exercise_id
join public.program_workouts w on w.id = pwe.workout_id
join public.program_weeks pw on pw.id = w.week_id
join public.program_share_receipts r on r.received_program_id = pw.program_id
where wse.source_scheduled_workout_exercise_id = swe.id
  and wse.exercise_id is null
  and swe.exercise_id is not null
  and not exists (
    select 1 from public.performed_sets s
    where s.workout_session_exercise_id = wse.id and s.result_v2 is not null
  );
