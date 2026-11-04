-- Optional selected metadata for user programs; existing plans remain untouched.
alter table public.programs add column if not exists details jsonb not null default '{}'::jsonb;
update public.programs p set details=coalesce(c.source_payload->'details','{}'::jsonb)
from public.catalog_programs c
where p.source_catalog_program_id=c.id and p.details='{}'::jsonb;

-- Newly adopted catalog programs inherit the same controlled facts as the catalog
-- detail page, in the existing adoption transaction.
create or replace function public.copy_catalog_program_details()
returns trigger language plpgsql security invoker set search_path = ''
as $$
begin
  if new.source_catalog_program_id is not null
    and (new.details is null or new.details = '{}'::jsonb) then
    select coalesce(c.source_payload->'details','{}'::jsonb)
    into new.details from public.catalog_programs c
    where c.id = new.source_catalog_program_id and c.published = true;
    new.details := coalesce(new.details,'{}'::jsonb);
  end if;
  return new;
end;
$$;
drop trigger if exists program_copy_catalog_details_on_insert on public.programs;
create trigger program_copy_catalog_details_on_insert
before insert on public.programs
for each row execute function public.copy_catalog_program_details();
