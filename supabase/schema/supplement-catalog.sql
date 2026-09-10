create table if not exists public.supplement_catalog (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  category text not null,
  short_description text not null,
  description text not null,
  recommendations text not null,
  composition jsonb not null default '[]'::jsonb,
  calories numeric not null default 0,
  protein_g numeric not null default 0,
  fat_g numeric not null default 0,
  carbs_g numeric not null default 0,
  serving_label text not null default 'на порцию',
  image_url text,
  caution text not null default 'Перед применением необходимо проконсультироваться со специалистом.',
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.supplement_catalog enable row level security;

drop policy if exists supplement_catalog_read on public.supplement_catalog;
create policy supplement_catalog_read on public.supplement_catalog
for select to authenticated using (is_active = true);

grant select on public.supplement_catalog to authenticated;
