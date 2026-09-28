-- Item #9 from a 2026-09-28 code review: composeBrief.ts inserted the brief
-- as status='ready' first, then brief_stories separately, only logging on
-- failure. A brief_stories failure left a "ready" brief (deliver would
-- still send it) whose stories were never recorded as briefed, so a later
-- run's dedup (worker/src/stages/composeBrief.ts's `alreadyBriefed` query)
-- could resurface the same stories in a future brief. Wrapping both inserts
-- in one PL/pgSQL function makes them atomic: a single function invocation
-- is one implicit transaction, so a failure on either insert rolls back the
-- whole thing and no half-written brief is left behind (see claim_jobs in
-- migration 0011 for the same pattern).
create or replace function create_daily_brief(p_owner_id uuid, p_period_date date, p_content jsonb, p_brief_stories jsonb)
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

  return v_brief_id;
end;
$$;
