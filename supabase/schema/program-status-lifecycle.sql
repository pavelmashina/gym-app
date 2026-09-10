-- Canonical participation status model.
-- Mirrors production migration program_cancelled_status_and_lifecycle_contracts.
update public.user_programs set status = 'cancelled', updated_at = now() where status = 'abandoned';
alter table public.user_programs drop constraint if exists user_programs_status_check;
alter table public.user_programs add constraint user_programs_status_check check (status in ('active','paused','completed','cancelled'));
create or replace function public.cancel_program(p_user_program_id uuid)
returns uuid language plpgsql set search_path = '' as $$
declare v_user_id uuid := auth.uid();
begin
  if v_user_id is null then raise exception 'Authentication required' using errcode='42501'; end if;
  update public.user_programs set status='cancelled', updated_at=now() where id=p_user_program_id and user_id=v_user_id and status in ('active','paused');
  if not found then raise exception 'Active program participation not found' using errcode='P0002'; end if;
  update public.scheduled_workouts set status='cancelled' where user_program_id=p_user_program_id and status in ('scheduled','skipped');
  return p_user_program_id;
end;
$$;
grant execute on function public.cancel_program(uuid) to authenticated;
