-- Optional selected metadata for user programs; existing plans remain untouched.
alter table public.programs add column if not exists details jsonb not null default '{}'::jsonb;
update public.programs p set details=coalesce(c.source_payload->'details','{}'::jsonb)
from public.catalog_programs c
where p.source_catalog_program_id=c.id and p.details='{}'::jsonb;
