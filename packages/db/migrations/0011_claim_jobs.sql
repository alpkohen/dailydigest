-- Atomic batch claim for the jobs queue (SPEC.md section 5: "workers claim
-- with FOR UPDATE SKIP LOCKED"). supabase-js can't express SKIP LOCKED
-- directly, so it's wrapped in an RPC function.

create or replace function claim_jobs(p_owner_id uuid, p_stage text, p_limit integer)
returns setof jobs
language plpgsql
as $$
begin
  return query
  update jobs
  set status = 'claimed', locked_at = now(), attempts = jobs.attempts + 1
  where jobs.id in (
    select id from jobs
    where owner_id = p_owner_id
      and stage = p_stage
      and status = 'pending'
    order by created_at
    limit p_limit
    for update skip locked
  )
  returning jobs.*;
end;
$$;
