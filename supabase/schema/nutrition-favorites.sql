-- Favorites for recipes and ready meal plans.
-- Mirrors production migration nutrition_favorites.

create table if not exists public.nutrition_favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  entity_type text not null check (entity_type in ('recipe','meal_plan')),
  entity_id uuid not null,
  created_at timestamptz not null default now(),
  unique (user_id, entity_type, entity_id)
);

alter table public.nutrition_favorites enable row level security;

drop policy if exists nutrition_favorites_select_own on public.nutrition_favorites;
create policy nutrition_favorites_select_own on public.nutrition_favorites
for select to authenticated using (auth.uid() = user_id);

drop policy if exists nutrition_favorites_insert_own on public.nutrition_favorites;
create policy nutrition_favorites_insert_own on public.nutrition_favorites
for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists nutrition_favorites_delete_own on public.nutrition_favorites;
create policy nutrition_favorites_delete_own on public.nutrition_favorites
for delete to authenticated using (auth.uid() = user_id);

grant select, insert, delete on public.nutrition_favorites to authenticated;
grant all on public.nutrition_favorites to service_role;

create index if not exists nutrition_favorites_user_type_idx
  on public.nutrition_favorites(user_id, entity_type, created_at desc);
