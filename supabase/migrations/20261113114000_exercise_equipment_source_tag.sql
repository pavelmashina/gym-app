-- Exercise apparatus label as supplied by the new source sheet. Keep broad
-- equipment for existing filters, and do not alter existing program references.
begin;
alter table public.exercises add column if not exists equipment_tag text;
commit;
