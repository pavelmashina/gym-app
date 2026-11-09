-- Internal Telegram issue composer. The bot alone uses the service role.
create table if not exists public.telegram_issue_drafts (
  chat_id text primary key,
  batch_id uuid not null default gen_random_uuid(),
  description text not null default '',
  images jsonb not null default '[]'::jsonb,
  composing boolean not null default false,
  updated_at timestamptz not null default now(),
  constraint telegram_issue_drafts_images_array check (jsonb_typeof(images) = 'array')
);

alter table public.telegram_issue_drafts enable row level security;
revoke all on table public.telegram_issue_drafts from anon, authenticated;
grant select, insert, update, delete on table public.telegram_issue_drafts to service_role;

-- Every Issue is public; use a dedicated public bucket for screenshots only.
-- Uploads are performed exclusively by the Edge Function using service_role.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('telegram-issue-screenshots', 'telegram-issue-screenshots', true, 8388608,
  array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;
