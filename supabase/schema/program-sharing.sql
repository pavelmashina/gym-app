-- A shared program is a snapshot invitation, not access to the owner's tables.
create table if not exists public.program_shares (
  code uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  source_program_id uuid not null references public.programs(id) on delete cascade,
  program_payload jsonb not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 days'),
  revoked_at timestamptz,
  check (jsonb_typeof(program_payload) = 'object')
);
create index if not exists program_shares_owner_created_idx on public.program_shares(owner_id,created_at desc);
create index if not exists program_shares_program_idx on public.program_shares(source_program_id);
alter table public.program_shares enable row level security;
revoke all on public.program_shares from public, anon, authenticated;
grant select, insert, delete on public.program_shares to authenticated;
drop policy if exists program_shares_select_owner on public.program_shares;
create policy program_shares_select_owner on public.program_shares for select to authenticated
using (owner_id=(select auth.uid()));
drop policy if exists program_shares_insert_owner on public.program_shares;
create policy program_shares_insert_owner on public.program_shares for insert to authenticated
with check (owner_id=(select auth.uid()));
drop policy if exists program_shares_delete_owner on public.program_shares;
create policy program_shares_delete_owner on public.program_shares for delete to authenticated
using (owner_id=(select auth.uid()));

create table if not exists public.program_share_receipts (
  share_code uuid not null references public.program_shares(code) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  received_program_id uuid references public.programs(id) on delete set null,
  accepted_at timestamptz not null default now(),
  primary key(share_code,recipient_id)
);
create index if not exists program_share_receipts_recipient_idx on public.program_share_receipts(recipient_id,accepted_at desc);
alter table public.program_share_receipts enable row level security;
revoke all on public.program_share_receipts from public, anon, authenticated;
grant select on public.program_share_receipts to authenticated;
drop policy if exists program_share_receipts_select_own on public.program_share_receipts;
create policy program_share_receipts_select_own on public.program_share_receipts
for select to authenticated using (recipient_id=(select auth.uid()));

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
                      'exercise_id',case when ex.owner_id is null then pwe.exercise_id else null end,
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

-- Privileged invitation operations live outside the exposed Data API schema.
create schema if not exists sharing_private;
revoke all on schema sharing_private from public, anon;
grant usage on schema sharing_private to authenticated;

-- Restricted invitation lookup: no source table rows or JSON payload are returned.
create or replace function sharing_private.preview_program_share(p_code uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_share public.program_shares%rowtype;
  v_sender text;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
  select * into v_share from public.program_shares
  where code=p_code and revoked_at is null and expires_at>now();
  if not found then raise exception 'Invitation not found or expired' using errcode='P0002'; end if;
  select coalesce(nullif(btrim(display_name),''),'Пользователь GYM') into v_sender
    from public.profiles where id=v_share.owner_id;
  return jsonb_build_object(
    'code',v_share.code,
    'name',v_share.program_payload->>'name',
    'description',v_share.program_payload->>'description',
    'sender_name',coalesce(v_sender,'Пользователь GYM'),
    'week_count',v_share.program_payload->>'week_count',
    'structure_mode',v_share.program_payload->>'structure_mode',
    'cycle_repeat_count',v_share.program_payload->>'cycle_repeat_count',
    'workout_count',(
      select coalesce(sum(jsonb_array_length(w->'workouts')),0)
      from jsonb_array_elements(v_share.program_payload->'weeks') w
    ),
    'expires_at',v_share.expires_at,
    'own_program',v_share.owner_id=auth.uid(),
    'already_accepted',exists(
      select 1 from public.program_share_receipts r
      where r.share_code=v_share.code and r.recipient_id=auth.uid() and r.received_program_id is not null
    )
  );
end;
$$;
revoke all on function sharing_private.preview_program_share(uuid) from public,anon,authenticated;
grant execute on function sharing_private.preview_program_share(uuid) to authenticated;
create or replace function public.preview_program_share(p_code uuid)
returns jsonb language sql security invoker set search_path = ''
as $$ select sharing_private.preview_program_share(p_code); $$;
revoke all on function public.preview_program_share(uuid) from public,anon,authenticated;
grant execute on function public.preview_program_share(uuid) to authenticated;

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
  insert into public.program_share_receipts(share_code,recipient_id,received_program_id)
    values(p_code,auth.uid(),v_new_program)
    on conflict (share_code,recipient_id)
    do update set received_program_id=excluded.received_program_id,accepted_at=now();
  return v_new_program;
end;
$$;
revoke all on function sharing_private.accept_program_share(uuid) from public,anon,authenticated;
grant execute on function sharing_private.accept_program_share(uuid) to authenticated;
create or replace function public.accept_program_share(p_code uuid)
returns uuid language sql security invoker set search_path = ''
as $$ select sharing_private.accept_program_share(p_code); $$;
revoke all on function public.accept_program_share(uuid) from public,anon,authenticated;
grant execute on function public.accept_program_share(uuid) to authenticated;
