-- Layer 2: sources suggested for a topic. The worker asks a model for
-- publications that cover the topic, finds each one's feed or sitemap,
-- checks it (robots.txt, parses, fresh items) and stores the result here.
-- The owner adds or dismisses each suggestion in the app.
create table topic_source_suggestions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  topic_id uuid not null references topics (id) on delete cascade,
  name text not null,
  homepage text,
  reason text,
  language text,
  -- What the check found: a feed ('rss') or a sitemap, and its URL.
  source_type text check (source_type in ('rss', 'sitemap')),
  feed_url text,
  recent_items integer,
  status text not null default 'ok' check (status in ('ok', 'no_feed', 'blocked', 'stale', 'added', 'dismissed')),
  check_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint topic_source_suggestions_topic_name_key unique (topic_id, name)
);
create trigger topic_source_suggestions_set_updated_at before update on topic_source_suggestions
  for each row execute function set_updated_at();
alter table topic_source_suggestions enable row level security;
create policy topic_source_suggestions_select_own on topic_source_suggestions for select using (owner_id = auth.uid());
create policy topic_source_suggestions_insert_own on topic_source_suggestions for insert with check (owner_id = auth.uid());
create policy topic_source_suggestions_update_own on topic_source_suggestions for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy topic_source_suggestions_delete_own on topic_source_suggestions for delete using (owner_id = auth.uid());

-- Set once the suggest_sources stage has run for a topic, so it runs once
-- per topic (new topics within two hours, existing ones on the next run).
alter table topics add column sources_suggested_at timestamptz;

-- Layer 3: per topic and source, how many items matched in the last
-- p_days days. Runs as the caller, so RLS applies in the app.
create or replace function topic_source_coverage(p_days integer)
returns table (topic_id uuid, source_id uuid, items bigint)
language sql
stable
as $$
  select s.topic_id, i.source_id, count(*)::bigint
  from item_topic_scores s
  join items i on i.id = s.item_id
  where coalesce(i.published_at, i.created_at) >= now() - make_interval(days => p_days)
  group by s.topic_id, i.source_id;
$$;
