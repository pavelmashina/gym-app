-- User settings used by the account Settings screen.
create table if not exists public.user_app_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  workout_push boolean not null default true,
  workout_email boolean not null default false,
  promos_push boolean not null default false,
  promos_email boolean not null default false,
  weight_unit text not null default 'kg' check (weight_unit in ('kg','lb')),
  theme text not null default 'light' check (theme in ('light','dark','system')),
  language text not null default 'ru' check (language in ('ru','en')),
  region text not null default 'RU',
  updated_at timestamptz not null default now()
);
alter table public.user_app_settings enable row level security;
create policy user_app_settings_select_own on public.user_app_settings for select to authenticated using (user_id = auth.uid());
create policy user_app_settings_insert_own on public.user_app_settings for insert to authenticated with check (user_id = auth.uid());
create policy user_app_settings_update_own on public.user_app_settings for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert, update on public.user_app_settings to authenticated;

-- Only non-sensitive card metadata/tokens belong here. PAN/CVC must never be stored in this table.
-- Actual card creation must be performed by a PCI-compliant payment provider.
create table if not exists public.payment_methods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null default 'pending',
  provider_payment_method_id text,
  brand text,
  last4 text check (last4 is null or last4 ~ '^[0-9]{4}$'),
  exp_month smallint check (exp_month is null or exp_month between 1 and 12),
  exp_year smallint,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.payment_methods enable row level security;
create policy payment_methods_select_own on public.payment_methods for select to authenticated using (user_id = auth.uid());
create policy payment_methods_delete_own on public.payment_methods for delete to authenticated using (user_id = auth.uid());
grant select, delete on public.payment_methods to authenticated;
