-- The status backfill below touches a few thousand rows on a small,
-- IO-throttled instance; the pooler's default statement timeout is too short.
set local statement_timeout = '10min';

-- Simplified pipeline (2026-10-04 rebuild): ingest -> match -> group ->
-- daily brief. Items keep only feed metadata (title/standfirst), are matched
-- to topics by keyword OR one batched LLM call, and matched items are grouped
-- into stories. Nothing is hidden: unmatched items stay as 'not_relevant'
-- and remain searchable.

-- Topic keyword lists drive the deterministic half of matching. Generated
-- once per topic by the worker (keywords_generated_at), and a new topic is
-- backfilled against the last 7 days of stored items (backfilled_at).
alter table topics add column keywords text[] not null default '{}';
alter table topics add column keywords_generated_at timestamptz;
alter table topics add column backfilled_at timestamptz;
-- Existing topics were already scored by the old pipeline; only topics
-- created from now on need a backfill.
update topics set backfilled_at = now();

-- 'grouped': matched ('scored') and attached to a story.
alter table items drop constraint items_status_check;
alter table items add constraint items_status_check check (
  status in ('new', 'extracted', 'embedded', 'scored', 'grouped', 'not_relevant', 'archived')
);

-- Archive search / Ask must find items with no embedding (the new pipeline
-- doesn't embed every item) and no stored full text (only feed metadata is
-- kept now): those match on title + feed summary.
create or replace function search_items(
  p_owner_id uuid,
  p_query_embedding vector(1024),
  p_query_text text,
  p_topic_id uuid default null,
  p_source_id uuid default null,
  p_perspective_group_id uuid default null,
  p_language text default null,
  p_date_from date default null,
  p_date_to date default null,
  p_match_count integer default 15
)
returns table (
  id uuid,
  title text,
  standfirst text,
  url text,
  language text,
  published_at timestamptz,
  score real
)
language plpgsql
as $$
begin
  return query
  select
    i.id,
    i.title,
    i.standfirst,
    i.url,
    i.language,
    i.published_at,
    (
      coalesce(1 - (i.embedding <=> p_query_embedding), 0) * 0.6
      + greatest(
          coalesce(ts_rank(i.fts, websearch_to_tsquery('simple', p_query_text)), 0),
          coalesce(ts_rank(to_tsvector('simple', coalesce(i.title, '') || ' ' || coalesce(i.standfirst, '')), websearch_to_tsquery('simple', p_query_text)), 0)
        ) * 0.4
    )::real as score
  from items i
  left join sources s on s.id = i.source_id
  where i.owner_id = p_owner_id
    and i.canonical_item_id is null
    and (
      (i.embedding is not null and p_query_embedding is not null)
      or i.fts @@ websearch_to_tsquery('simple', p_query_text)
      or to_tsvector('simple', coalesce(i.title, '') || ' ' || coalesce(i.standfirst, '')) @@ websearch_to_tsquery('simple', p_query_text)
    )
    and (
      p_topic_id is null
      or exists (select 1 from item_topic_scores its where its.item_id = i.id and its.topic_id = p_topic_id)
    )
    and (p_source_id is null or i.source_id = p_source_id)
    and (p_perspective_group_id is null or s.perspective_group_id = p_perspective_group_id)
    and (p_language is null or i.language = p_language)
    and (p_date_from is null or i.published_at >= p_date_from)
    and (p_date_to is null or i.published_at <= p_date_to)
  order by score desc
  limit p_match_count;
end;
$$;

-- Retention: unmatched items older than p_days are deleted, except ones the
-- owner saved or a watch linked. Keeps the database inside the free tier.
create or replace function purge_old_unmatched_items(p_owner_id uuid, p_days integer)
returns integer
language plpgsql
as $$
declare
  deleted integer;
begin
  delete from items i
  where i.owner_id = p_owner_id
    and i.status = 'not_relevant'
    and i.created_at < now() - make_interval(days => p_days)
    and not exists (select 1 from reading_list r where r.item_id = i.id)
    and not exists (select 1 from watch_items w where w.item_id = i.id);
  get diagnostics deleted = row_count;
  return deleted;
end;
$$;

-- One-time cleanup of the old pipeline's leftovers.
-- The database was at 494 MB of the 500 MB free tier. The two HNSW vector
-- indexes (items 136 MB, stories 19 MB) only served the old embed/cluster
-- stages; dropping them frees that space at once without rewriting rows.
-- Vector similarity in search_items still works, as a scan.
drop index if exists items_embedding_hnsw_idx;
drop index if exists stories_centroid_hnsw_idx;
-- The job queue is no longer used by the daily path; its backlog was
-- blocking newer runs.
delete from jobs;
-- Items the old pipeline never finished are left as plain unmatched items
-- (still searchable), not re-matched in bulk.
update items set status = 'not_relevant'
  where status in ('new', 'extracted', 'embedded') and created_at < now() - interval '2 days';
