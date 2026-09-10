create table if not exists public.nutrition_targets (
  user_id uuid primary key references auth.users(id) on delete cascade,
  sex text not null check (sex in ('male','female')),
  height_cm numeric(5,1) not null check (height_cm > 0),
  weight_kg numeric(6,2) not null check (weight_kg > 0),
  age integer not null check (age between 16 and 100),
  activity_level text not null check (activity_level in ('low','light','moderate','high','very_high')),
  goal text not null check (goal in ('cut','loss','maintain','gain')),
  calories integer not null check (calories > 0),
  protein_g integer not null check (protein_g >= 0),
  fat_g integer not null check (fat_g >= 0),
  carbs_g integer not null check (carbs_g >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.nutrition_targets enable row level security;
grant select, insert, update, delete on public.nutrition_targets to authenticated;

create policy nutrition_targets_select_own on public.nutrition_targets for select to authenticated using (auth.uid() = user_id);
create policy nutrition_targets_insert_own on public.nutrition_targets for insert to authenticated with check (auth.uid() = user_id);
create policy nutrition_targets_update_own on public.nutrition_targets for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy nutrition_targets_delete_own on public.nutrition_targets for delete to authenticated using (auth.uid() = user_id);
