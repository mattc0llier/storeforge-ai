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

create index if not exists workflow_events_workflow_run_id_created_at_idx
  on public.workflow_events(workflow_run_id, created_at);

create index if not exists workflow_events_store_id_created_at_idx
  on public.workflow_events(store_id, created_at);
