-- Keep all existing drafts in Gym App and allow explicit project selection
-- for newly started Telegram tasks (NULL means project not chosen yet).
ALTER TABLE public.telegram_issue_drafts
  ADD COLUMN IF NOT EXISTS project text DEFAULT 'gym-app';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'telegram_issue_drafts_project_check'
      AND conrelid = 'public.telegram_issue_drafts'::regclass
  ) THEN
    ALTER TABLE public.telegram_issue_drafts
      ADD CONSTRAINT telegram_issue_drafts_project_check
      CHECK (project IS NULL OR project IN ('gym-app', 'ryadom-app'));
  END IF;
END $$;

COMMENT ON COLUMN public.telegram_issue_drafts.project
  IS 'Selected GitHub project: gym-app, ryadom-app, or NULL awaiting Telegram selection.';
