-- Allow multiple Telegram forum topics in the same group, one per project.
-- Preserve the existing bound topic as Gym App.
ALTER TABLE public.telegram_issue_bound_topics
  ADD COLUMN IF NOT EXISTS project text NOT NULL DEFAULT 'gym-app';

ALTER TABLE public.telegram_issue_bound_topics
  DROP CONSTRAINT IF EXISTS telegram_issue_bound_topics_pkey;

ALTER TABLE public.telegram_issue_bound_topics
  ADD CONSTRAINT telegram_issue_bound_topics_pkey PRIMARY KEY (chat_id, thread_id);

ALTER TABLE public.telegram_issue_bound_topics
  ADD CONSTRAINT telegram_issue_bound_topics_project_check
  CHECK (project IN ('gym-app', 'ryadom-app'));

ALTER TABLE public.telegram_issue_bound_topics
  ADD CONSTRAINT telegram_issue_bound_topics_chat_project_key UNIQUE (chat_id, project);

COMMENT ON COLUMN public.telegram_issue_bound_topics.project
  IS 'Fixed GitHub destination for a Telegram forum topic; existing topics default to gym-app.';
