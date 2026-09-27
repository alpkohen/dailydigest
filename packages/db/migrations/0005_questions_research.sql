-- question_evidence, question_updates, research_items. SPEC.md section 8.

create table question_evidence (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  question_id uuid not null references questions (id) on delete cascade,
  story_id uuid not null references stories (id) on delete cascade,
  stance text check (stance in ('supports', 'complicates', 'neutral')),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint question_evidence_question_story_key unique (question_id, story_id)
);
create trigger question_evidence_set_updated_at before update on question_evidence
  for each row execute function set_updated_at();

create table question_updates (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  question_id uuid not null references questions (id) on delete cascade,
  period_start date not null,
  period_end date not null,
  text text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger question_updates_set_updated_at before update on question_updates
  for each row execute function set_updated_at();

create table research_items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  item_id uuid not null references items (id) on delete cascade,
  openalex_id text,
  doi text,
  journal text,
  authors jsonb not null default '[]'::jsonb,
  argument text,
  method text,
  relevance text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint research_items_item_key unique (item_id)
);
create trigger research_items_set_updated_at before update on research_items
  for each row execute function set_updated_at();
