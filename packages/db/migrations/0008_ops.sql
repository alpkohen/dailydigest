-- jobs, pipeline_runs, llm_calls, evals. SPEC.md section 8 and section 5
-- (jobs table is the batch queue, workers claim with FOR UPDATE SKIP LOCKED).

create table pipeline_runs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('nightly', 'alert', 'weekly', 'manual')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running' check (status in ('running', 'ok', 'failed', 'partial')),
  stats jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger pipeline_runs_set_updated_at before update on pipeline_runs
  for each row execute function set_updated_at();

create table jobs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  run_id uuid references pipeline_runs (id) on delete cascade,
  stage text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (
    status in ('pending', 'claimed', 'done', 'failed')
  ),
  attempts integer not null default 0,
  error text,
  locked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger jobs_set_updated_at before update on jobs
  for each row execute function set_updated_at();

create table llm_calls (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  run_id uuid references pipeline_runs (id) on delete set null,
  stage text,
  prompt_name text not null,
  model text not null,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cost_usd numeric(10, 6) not null default 0,
  latency_ms integer,
  ok boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger llm_calls_set_updated_at before update on llm_calls
  for each row execute function set_updated_at();

create table evals (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  suite text not null,
  config jsonb not null default '{}'::jsonb,
  metrics jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger evals_set_updated_at before update on evals
  for each row execute function set_updated_at();
