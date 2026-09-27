-- Fixes 0016: the LEFT JOIN against item_topic_scores fanned out one row
-- per matching topic score when p_topic_id was null (every item with N
-- topic scores came back N times, all with the same score value). An
-- EXISTS check doesn't multiply rows.

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
      + coalesce(ts_rank(i.fts, websearch_to_tsquery('simple', p_query_text)), 0) * 0.4
    )::real as score
  from items i
  left join sources s on s.id = i.source_id
  where i.owner_id = p_owner_id
    and i.canonical_item_id is null
    and i.embedding is not null
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
