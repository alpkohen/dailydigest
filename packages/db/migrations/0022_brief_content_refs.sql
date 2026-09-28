-- Item #7 from a 2026-09-28 code review: regular stories are deduped
-- across briefs via brief_stories, but research items, the outside-radar
-- pick, and watchlist items had no such tracking - the same research
-- item, outside-radar pick, or watchlist link could resurface in a later
-- daily brief with nothing recording it had already been shown.
create table brief_content_refs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  brief_id uuid not null references briefs (id) on delete cascade,
  content_type text not null check (content_type in ('research_item', 'outside_radar', 'watchlist_item')),
  ref_id uuid not null,
  created_at timestamptz not null default now(),
  constraint brief_content_refs_unique unique (owner_id, content_type, ref_id)
);

alter table brief_content_refs enable row level security;
create policy brief_content_refs_select_own on brief_content_refs for select using (owner_id = auth.uid());
create policy brief_content_refs_insert_own on brief_content_refs for insert with check (owner_id = auth.uid());
create policy brief_content_refs_update_own on brief_content_refs for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy brief_content_refs_delete_own on brief_content_refs for delete using (owner_id = auth.uid());

-- Extends create_daily_brief (migration 0021) to record these refs in the
-- same transaction as the brief itself, so a failure here rolls back the
-- whole brief exactly like a brief_stories failure already does.
create or replace function create_daily_brief(p_owner_id uuid, p_period_date date, p_content jsonb, p_brief_stories jsonb, p_content_refs jsonb default '[]'::jsonb)
returns uuid
language plpgsql
as $$
declare
  v_brief_id uuid;
begin
  insert into briefs (owner_id, kind, period_date, content, status)
  values (p_owner_id, 'daily', p_period_date, p_content, 'ready')
  returning id into v_brief_id;

  insert into brief_stories (owner_id, brief_id, story_id, section, position)
  select p_owner_id, v_brief_id, (elem->>'story_id')::uuid, elem->>'section', (elem->>'position')::integer
  from jsonb_array_elements(p_brief_stories) as elem;

  insert into brief_content_refs (owner_id, brief_id, content_type, ref_id)
  select p_owner_id, v_brief_id, elem->>'content_type', (elem->>'ref_id')::uuid
  from jsonb_array_elements(p_content_refs) as elem;

  return v_brief_id;
end;
$$;
