create table if not exists public.support_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  topic text not null check (char_length(btrim(topic)) between 1 and 120),
  reply_email text not null check (char_length(btrim(reply_email)) between 3 and 320),
  message text not null check (char_length(btrim(message)) between 3 and 5000),
  status text not null default 'new' check (status in ('new','in_progress','closed')),
  created_at timestamptz not null default now()
);

alter table public.support_requests enable row level security;

drop policy if exists "support_requests_select_own" on public.support_requests;
create policy "support_requests_select_own" on public.support_requests
for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "support_requests_insert_own" on public.support_requests;
create policy "support_requests_insert_own" on public.support_requests
for insert to authenticated with check ((select auth.uid()) = user_id);

grant select, insert on public.support_requests to authenticated;
grant all on public.support_requests to service_role;
