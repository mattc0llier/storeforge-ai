create extension if not exists pgcrypto;

create table if not exists public.stores (
  id uuid primary key default gen_random_uuid(),
  clerk_user_id text not null,
  name text not null,
  slug text not null unique,
  business_idea text not null,
  original_prompt text not null,
  blueprint_json jsonb not null default '{}'::jsonb,
  status text not null default 'draft'
    check (status in ('draft', 'generating', 'generated', 'deploying', 'deployed', 'failed')),
  product_count integer not null check (product_count between 1 and 7),
  source_template_repo text not null default 'vercel/commerce',
  generated_repo_owner text,
  generated_repo_name text,
  generated_repo_full_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workflow_runs (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  workflow_name text not null,
  provider_run_id text,
  status text not null default 'queued'
    check (status in ('queued', 'running', 'succeeded', 'failed', 'canceled')),
  current_step text,
  repair_count integer not null default 0,
  logs_summary jsonb not null default '[]'::jsonb,
  modified_files_summary jsonb not null default '[]'::jsonb,
  codex_activity_summary jsonb not null default '[]'::jsonb,
  workspace_path text,
  artifact_metadata jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  error_message text
);

create table if not exists public.workflow_events (
  id uuid primary key default gen_random_uuid(),
  workflow_run_id uuid not null references public.workflow_runs(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  trace_id text not null,
  span_id text not null default replace(gen_random_uuid()::text, '-', ''),
  parent_span_id text,
  event_name text not null,
  step text not null,
  status text not null
    check (status in ('queued', 'running', 'succeeded', 'failed', 'info')),
  message text not null,
  duration_ms integer,
  attributes jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.deployment_metadata (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  vercel_project_id text,
  vercel_deployment_id text,
  deployment_url text,
  preview_url text,
  production_url text,
  environment text not null default 'preview'
    check (environment in ('preview', 'production')),
  status text not null default 'queued'
    check (status in ('queued', 'building', 'ready', 'error', 'canceled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists stores_clerk_user_id_idx
  on public.stores(clerk_user_id);

create index if not exists workflow_runs_store_id_idx
  on public.workflow_runs(store_id);

create index if not exists workflow_events_workflow_run_id_created_at_idx
  on public.workflow_events(workflow_run_id, created_at);

create index if not exists workflow_events_store_id_created_at_idx
  on public.workflow_events(store_id, created_at);

create index if not exists deployment_metadata_store_id_idx
  on public.deployment_metadata(store_id);

-- Lightweight migration helpers for early local databases created before the
-- blueprint approval flow existed.
alter table public.stores
  add column if not exists original_prompt text;

alter table public.stores
  add column if not exists blueprint_json jsonb not null default '{}'::jsonb;

update public.stores
  set original_prompt = business_idea
  where original_prompt is null;

alter table public.stores
  alter column original_prompt set not null;

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
