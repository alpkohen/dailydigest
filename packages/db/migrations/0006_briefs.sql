-- briefs, brief_stories. SPEC.md section 8.

create table briefs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('daily', 'weekly', 'alert')),
  period_date date not null,
  content jsonb,
  html text,
  sent_at timestamptz,
  resend_id text,
  status text not null default 'draft' check (status in ('draft', 'ready', 'sent', 'failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger briefs_set_updated_at before update on briefs
  for each row execute function set_updated_at();

create table brief_stories (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  brief_id uuid not null references briefs (id) on delete cascade,
  story_id uuid not null references stories (id) on delete cascade,
  section text not null,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint brief_stories_brief_story_key unique (brief_id, story_id)
);
create trigger brief_stories_set_updated_at before update on brief_stories
  for each row execute function set_updated_at();
