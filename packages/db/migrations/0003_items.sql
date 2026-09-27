-- items, item_topic_scores. SPEC.md section 8 and section 6 (unique constraint
-- on (owner_id, canonical_url) for ingest dedup).
--
-- NOTE: embedding dimension is a provisional placeholder (1024) pending the
-- M2 embedding model eval (SPEC.md section 12). A follow-up migration will
-- alter this column once a model is chosen.

create table items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  source_id uuid references sources (id) on delete set null,
  canonical_url text not null,
  url text not null,
  title text not null,
  standfirst text,
  author text,
  published_at timestamptz,
  language text,
  text text,
  text_hash text,
  simhash bigint,
  paywalled boolean not null default false,
  raw jsonb,
  embedding vector(1024),
  embedding_model text,
  canonical_item_id uuid references items (id) on delete set null,
  status text not null default 'new' check (
    status in ('new', 'extracted', 'embedded', 'scored', 'not_relevant', 'archived')
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint items_owner_canonical_url_key unique (owner_id, canonical_url)
);
create trigger items_set_updated_at before update on items
  for each row execute function set_updated_at();

create table item_topic_scores (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  item_id uuid not null references items (id) on delete cascade,
  topic_id uuid not null references topics (id) on delete cascade,
  score numeric(4, 2) not null check (score >= 0 and score <= 10),
  reason text,
  model text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint item_topic_scores_item_topic_key unique (item_id, topic_id)
);
create trigger item_topic_scores_set_updated_at before update on item_topic_scores
  for each row execute function set_updated_at();
