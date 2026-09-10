create table if not exists public.meal_plans (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  image_url text,
  goal text not null,
  calories_per_day integer not null check (calories_per_day > 0),
  short_description text not null default '',
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.meal_plan_meals (
  id uuid primary key default gen_random_uuid(),
  meal_plan_id uuid not null references public.meal_plans(id) on delete cascade,
  meal_order integer not null check (meal_order > 0),
  meal_type text not null,
  title text not null,
  image_url text,
  calories integer not null check (calories > 0),
  protein_g numeric(8,1),
  fat_g numeric(8,1),
  carbs_g numeric(8,1),
  ingredients jsonb not null default '[]'::jsonb,
  steps jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  unique (meal_plan_id, meal_order)
);

alter table public.meal_plans enable row level security;
alter table public.meal_plan_meals enable row level security;

create policy meal_plans_read_active on public.meal_plans
for select to authenticated using (is_active = true);

create policy meal_plan_meals_read_active on public.meal_plan_meals
for select to authenticated using (
  exists (
    select 1 from public.meal_plans p
    where p.id = meal_plan_id and p.is_active = true
  )
);

grant select on public.meal_plans to authenticated;
grant select on public.meal_plan_meals to authenticated;
