-- Cover the programs.source_catalog_program_id foreign key used by catalog adoption.
-- The owner/source unique index serves idempotency; this single-column index serves FK lookups.

create index if not exists programs_source_catalog_idx
  on public.programs (source_catalog_program_id);
