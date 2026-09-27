-- feedback, reading_list, dossiers, ask_threads, ask_messages. SPEC.md section 8.

create table feedback (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  target_type text not null check (target_type in ('item', 'story', 'source')),
  target_id uuid not null,
  signal text not null check (
    signal in (
      'relevant', 'not_relevant', 'less_like_this', 'more_from_this_source',
      'mute_source', 'saved', 'opened'
    )
  ),
  context text check (context in ('email', 'app')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger feedback_set_updated_at before update on feedback
  for each row execute function set_updated_at();

create table reading_list (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  item_id uuid references items (id) on delete cascade,
  story_id uuid references stories (id) on delete cascade,
  tags text[] not null default '{}',
  notes text,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reading_list_item_or_story check (
    (item_id is not null and story_id is null) or (item_id is null and story_id is not null)
  )
);
create trigger reading_list_set_updated_at before update on reading_list
  for each row execute function set_updated_at();

create table dossiers (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  subject_type text not null check (subject_type in ('story', 'topic', 'question')),
  subject_id uuid not null,
  prompt text,
  content jsonb,
  status text not null default 'pending' check (status in ('pending', 'running', 'done', 'failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger dossiers_set_updated_at before update on dossiers
  for each row execute function set_updated_at();

create table ask_threads (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  scope text not null check (scope in ('archive', 'story')),
  story_id uuid references stories (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ask_threads_story_scope check (
    (scope = 'story' and story_id is not null) or (scope = 'archive' and story_id is null)
  )
);
create trigger ask_threads_set_updated_at before update on ask_threads
  for each row execute function set_updated_at();

create table ask_messages (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  thread_id uuid not null references ask_threads (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  citations jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger ask_messages_set_updated_at before update on ask_messages
  for each row execute function set_updated_at();
