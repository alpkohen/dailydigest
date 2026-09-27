-- stories, story_items, story_links, story_topics. SPEC.md section 8.

create table stories (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  summary text,
  what_changed text,
  why_it_matters text,
  watch_next text,
  framing jsonb not null default '[]'::jsonb,
  entities jsonb not null default '[]'::jsonb,
  tier integer check (tier in (1, 2, 3)),
  novelty text check (novelty in ('new', 'continuation', 'repetition')),
  rank_score numeric(6, 2),
  centroid vector(1024),
  first_seen_at timestamptz not null default now(),
  last_updated_at timestamptz not null default now(),
  status text not null default 'open' check (status in ('open', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger stories_set_updated_at before update on stories
  for each row execute function set_updated_at();

create table story_items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  story_id uuid not null references stories (id) on delete cascade,
  item_id uuid not null references items (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint story_items_story_item_key unique (story_id, item_id)
);
create trigger story_items_set_updated_at before update on story_items
  for each row execute function set_updated_at();

create table story_links (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  story_id uuid not null references stories (id) on delete cascade,
  related_story_id uuid not null references stories (id) on delete cascade,
  relation text not null check (relation in ('continuation', 'related')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint story_links_story_related_key unique (story_id, related_story_id)
);
create trigger story_links_set_updated_at before update on story_links
  for each row execute function set_updated_at();

create table story_topics (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  story_id uuid not null references stories (id) on delete cascade,
  topic_id uuid not null references topics (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint story_topics_story_topic_key unique (story_id, topic_id)
);
create trigger story_topics_set_updated_at before update on story_topics
  for each row execute function set_updated_at();
