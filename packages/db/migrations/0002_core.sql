-- profiles, perspective_groups, sources, topics, questions, watches
-- SPEC.md section 8.

create table profiles (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references auth.users (id) on delete cascade,
  language text not null default 'tr',
  timezone text not null default 'Europe/Istanbul',
  brief_time time not null default '07:00',
  quiet_hours jsonb not null default '{"start": "23:00", "end": "07:00"}'::jsonb,
  daily_budget_usd numeric(10, 2) not null default 5.00,
  interest_profile text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger profiles_set_updated_at before update on profiles
  for each row execute function set_updated_at();

create table perspective_groups (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  description text,
  colour text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger perspective_groups_set_updated_at before update on perspective_groups
  for each row execute function set_updated_at();

create table sources (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  type text not null check (type in ('rss', 'api_openalex', 'api_gdelt', 'api_exa', 'sitemap', 'scrape')),
  url_or_query text,
  country text,
  language text,
  perspective_group_id uuid references perspective_groups (id) on delete set null,
  weight numeric(3, 2) not null default 0.5 check (weight >= 0 and weight <= 1),
  weight_locked boolean not null default false,
  paywalled boolean not null default false,
  fetch_interval interval not null default '1 hour',
  active boolean not null default true,
  health_status text not null default 'unknown' check (health_status in ('unknown', 'ok', 'degraded', 'broken')),
  last_fetched_at timestamptz,
  error_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger sources_set_updated_at before update on sources
  for each row execute function set_updated_at();

create table topics (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  description text,
  queries_tr text[] not null default '{}',
  queries_en text[] not null default '{}',
  exclusions text[] not null default '{}',
  priority text not null default 'normal' check (priority in ('high', 'normal', 'low')),
  frequency text not null default 'daily' check (frequency in ('daily', 'weekly', 'alerts_only')),
  alerts_enabled boolean not null default false,
  languages text[] not null default '{tr,en}',
  active boolean not null default true,
  embedding vector(1024),
  relevance_threshold numeric(4, 2) not null default 5.0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger topics_set_updated_at before update on topics
  for each row execute function set_updated_at();

create table questions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  text text not null,
  active boolean not null default true,
  embedding vector(1024),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger questions_set_updated_at before update on questions
  for each row execute function set_updated_at();

create table watches (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('person', 'institution', 'journal')),
  name text not null,
  identifiers jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger watches_set_updated_at before update on watches
  for each row execute function set_updated_at();
