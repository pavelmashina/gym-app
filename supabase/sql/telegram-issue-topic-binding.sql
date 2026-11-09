-- Telegram bot: authorized contributors and one bound forum topic per supergroup.
-- The original owner's Telegram ID stays in the server-only TELEGRAM_ALLOWED_USER_ID secret.
create table if not exists public.telegram_issue_authorized_users (
  telegram_id text primary key,
  added_by text not null,
  added_at timestamptz not null default now(),
  constraint telegram_issue_authorized_users_numeric_id check (telegram_id ~ '^[0-9]{1,20}$')
);
alter table public.telegram_issue_authorized_users enable row level security;
revoke all on public.telegram_issue_authorized_users from anon, authenticated;
grant select, insert, update, delete on public.telegram_issue_authorized_users to service_role;

create table if not exists public.telegram_issue_bound_topics (
  chat_id text primary key,
  thread_id bigint not null,
  bound_by text not null,
  bound_at timestamptz not null default now(),
  constraint telegram_issue_bound_topics_negative_group check (chat_id ~ '^-[0-9]{1,20}$'),
  constraint telegram_issue_bound_topics_positive_thread check (thread_id > 0)
);
alter table public.telegram_issue_bound_topics enable row level security;
revoke all on public.telegram_issue_bound_topics from anon, authenticated;
grant select, insert, update, delete on public.telegram_issue_bound_topics to service_role;

-- Existing drafts table already uses a text key; new group drafts are keyed as
-- <group_id>:<thread_id>:<sender_id>, with private drafts retaining the old <chat_id> key.
