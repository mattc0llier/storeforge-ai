alter table public.workflow_runs
  add column if not exists current_step text;

alter table public.workflow_runs
  add column if not exists repair_count integer not null default 0;

alter table public.workflow_runs
  add column if not exists logs_summary jsonb not null default '[]'::jsonb;

alter table public.workflow_runs
  add column if not exists modified_files_summary jsonb not null default '[]'::jsonb;

alter table public.workflow_runs
  add column if not exists codex_activity_summary jsonb not null default '[]'::jsonb;

alter table public.workflow_runs
  add column if not exists workspace_path text;

alter table public.workflow_runs
  add column if not exists artifact_metadata jsonb not null default '{}'::jsonb;
