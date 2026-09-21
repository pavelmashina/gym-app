-- Commercial foundation for subscription tiers, provider billing webhooks and Web Push endpoints.
-- Pricing is intentionally not hard-coded here; it belongs to the selected payment provider/product configuration.

create table if not exists public.subscription_plans (
  code text primary key check (code in ('free','pro','premium')),
  name text not null,
  description text,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  features jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.subscription_plans (code,name,description,sort_order,features)
values
('free','Бесплатный','Основные функции приложения',10,'{"workouts":true,"programs":true,"nutrition":true,"basic_statistics":true}'::jsonb),
('pro','Pro','Расширенные функции и аналитика',20,'{"workouts":true,"programs":true,"nutrition":true,"basic_statistics":true,"advanced_statistics":true,"cross_device_sync":true}'::jsonb),
('premium','Premium','Максимальный набор возможностей',30,'{"workouts":true,"programs":true,"nutrition":true,"basic_statistics":true,"advanced_statistics":true,"cross_device_sync":true,"priority_support":true}'::jsonb)
on conflict (code) do update set
  name=excluded.name, description=excluded.description, sort_order=excluded.sort_order,
  features=excluded.features, updated_at=now();

alter table public.subscription_plans enable row level security;
drop policy if exists subscription_plans_read on public.subscription_plans;
create policy subscription_plans_read on public.subscription_plans
for select to authenticated using (is_active);
grant select on public.subscription_plans to authenticated;

create table if not exists public.user_subscriptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan_code text not null default 'free' references public.subscription_plans(code),
  status text not null default 'inactive'
    check (status in ('inactive','trialing','active','past_due','cancelled','expired')),
  provider text,
  provider_customer_id text,
  provider_subscription_id text,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_subscriptions enable row level security;
drop policy if exists user_subscriptions_select_own on public.user_subscriptions;
create policy user_subscriptions_select_own on public.user_subscriptions
for select to authenticated using (user_id = auth.uid());
grant select on public.user_subscriptions to authenticated;

create or replace function public.get_my_subscription()
returns table(
  plan_code text,
  status text,
  current_period_end timestamptz,
  cancel_at_period_end boolean,
  features jsonb
)
language sql
security invoker
set search_path = public
as $$
  select
    sp.code,
    coalesce(us.status,'inactive'),
    us.current_period_end,
    coalesce(us.cancel_at_period_end,false),
    sp.features
  from public.subscription_plans sp
  left join public.user_subscriptions us
    on us.user_id = auth.uid() and us.plan_code = sp.code
  where sp.code = coalesce(
    (select plan_code from public.user_subscriptions where user_id = auth.uid()),
    'free'
  )
  limit 1;
$$;
grant execute on function public.get_my_subscription() to authenticated;

create or replace function public.has_entitlement(p_feature text)
returns boolean
language sql
security invoker
set search_path = public
as $$
  select coalesce((sp.features ->> p_feature)::boolean, false)
  from public.subscription_plans sp
  where sp.code = coalesce(
    (select us.plan_code
       from public.user_subscriptions us
      where us.user_id = auth.uid()
        and (us.plan_code = 'free' or us.status in ('active','trialing'))
      limit 1),
    'free'
  );
$$;
grant execute on function public.has_entitlement(text) to authenticated;

-- Service-role only. Webhook payloads must never be writable/readable by clients.
create table if not exists public.billing_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  provider text not null,
  provider_event_id text unique,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  processed_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.billing_events enable row level security;
revoke all on public.billing_events from anon, authenticated;

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  user_agent text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, endpoint)
);
alter table public.push_subscriptions enable row level security;
drop policy if exists push_subscriptions_select_own on public.push_subscriptions;
drop policy if exists push_subscriptions_insert_own on public.push_subscriptions;
drop policy if exists push_subscriptions_update_own on public.push_subscriptions;
drop policy if exists push_subscriptions_delete_own on public.push_subscriptions;
create policy push_subscriptions_select_own on public.push_subscriptions for select to authenticated using (user_id = auth.uid());
create policy push_subscriptions_insert_own on public.push_subscriptions for insert to authenticated with check (user_id = auth.uid());
create policy push_subscriptions_update_own on public.push_subscriptions for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy push_subscriptions_delete_own on public.push_subscriptions for delete to authenticated using (user_id = auth.uid());
grant select, insert, update, delete on public.push_subscriptions to authenticated;


-- YooKassa saved payment methods must be idempotent per user/provider.
create unique index if not exists payment_methods_provider_unique
  on public.payment_methods(user_id, provider, provider_payment_method_id)
  where provider_payment_method_id is not null;

create or replace function public.request_subscription_cancellation()
returns public.user_subscriptions
language plpgsql
security invoker
set search_path = public
as $$
declare
  result public.user_subscriptions;
begin
  update public.user_subscriptions
     set cancel_at_period_end = true,
         cancelled_at = now(),
         updated_at = now()
   where user_id = auth.uid()
     and status in ('active','trialing','past_due')
  returning * into result;

  if result.user_id is null then
    raise exception 'Active subscription not found';
  end if;
  return result;
end;
$$;
grant execute on function public.request_subscription_cancellation() to authenticated;


create table if not exists public.notification_delivery_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  scheduled_workout_id uuid references public.scheduled_workouts(id) on delete cascade,
  notification_type text not null,
  local_date date not null,
  created_at timestamptz not null default now(),
  unique(user_id, scheduled_workout_id, notification_type, local_date)
);
alter table public.notification_delivery_log enable row level security;
revoke all on public.notification_delivery_log from anon, authenticated;
