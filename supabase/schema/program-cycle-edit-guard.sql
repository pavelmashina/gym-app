-- Prevent changing the expanded cycle shape while a user has a live participation.
-- Rhythm/date edits are still allowed; only structure_mode and cycle_repeat_count are frozen.

create or replace function private.guard_active_program_cycle_configuration()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if (new.structure_mode is distinct from old.structure_mode
      or new.cycle_repeat_count is distinct from old.cycle_repeat_count)
     and exists (
       select 1
       from public.user_programs up
       where up.program_id = old.id
         and up.user_id = old.owner_id
         and up.status in ('active','paused')
     ) then
    raise exception 'Cycle configuration cannot change while the program is active or paused' using errcode = '22023';
  end if;
  return new;
end;
$$;

drop trigger if exists programs_guard_active_cycle_configuration on public.programs;
create trigger programs_guard_active_cycle_configuration
before update of structure_mode, cycle_repeat_count on public.programs
for each row
execute function private.guard_active_program_cycle_configuration();

revoke all on function private.guard_active_program_cycle_configuration() from public, anon, authenticated;
