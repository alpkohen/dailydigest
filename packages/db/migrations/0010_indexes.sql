-- HNSW on embeddings, GIN full text (tr/en) on items, trigram on titles,
-- btree on published_at/status. SPEC.md section 8, "Indexes".

alter table items add column fts tsvector generated always as (
  to_tsvector(
    case when language = 'tr' then 'turkish'::regconfig else 'english'::regconfig end,
    coalesce(title, '') || ' ' || coalesce(text, '')
  )
) stored;

create index items_fts_idx on items using gin (fts);
create index items_title_trgm_idx on items using gin (title gin_trgm_ops);
create index items_published_at_idx on items using btree (published_at);
create index items_status_idx on items using btree (status);
create index items_embedding_hnsw_idx on items using hnsw (embedding vector_cosine_ops);

create index topics_embedding_hnsw_idx on topics using hnsw (embedding vector_cosine_ops);
create index questions_embedding_hnsw_idx on questions using hnsw (embedding vector_cosine_ops);
create index stories_centroid_hnsw_idx on stories using hnsw (centroid vector_cosine_ops);

create index jobs_stage_status_idx on jobs using btree (stage, status);
create index llm_calls_created_at_idx on llm_calls using btree (created_at);
