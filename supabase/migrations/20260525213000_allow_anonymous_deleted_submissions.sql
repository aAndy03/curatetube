ALTER TABLE public.submissions
  ALTER COLUMN submitter_id DROP NOT NULL;

ALTER TABLE public.video_submitters
  ALTER COLUMN user_id DROP NOT NULL;
