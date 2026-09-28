-- Recommendation #2 from reviewing a sister project (Actaware): its
-- ai-chat endpoint has a Postgres-backed sliding-window rate limit;
-- dailydigest's archive/actions.ts (search_items + LLM-backed ask_archive)
-- has none, so a buggy client loop or a leaked link could run up real
-- Anthropic/OpenAI cost with no backstop. Same bucket-per-window pattern,
-- adapted to dailydigest's owner_id + RLS convention and callable by the
-- signed-in user's own session (anon key), not just the service role.
create table api_rate_buckets (
  owner_id uuid not null references auth.users (id) on delete cascade,
  bucket_key text not null,
  window_epoch bigint not null,
  hit_count integer not null default 0,
  primary key (owner_id, bucket_key, window_epoch)
);

alter table api_rate_buckets enable row level security;
-- No policies: only the SECURITY DEFINER function below touches this
-- table, matching the claim_jobs / create_daily_brief pattern for
-- functions that must write regardless of the caller's own RLS grants.

create or replace function consume_rate(p_owner_id uuid, p_bucket text, p_window_seconds integer, p_max integer)
returns table(allowed boolean, hit_count integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  w_epoch bigint;
  c integer;
begin
  if p_owner_id is distinct from auth.uid() then
    raise exception 'consume_rate: owner_id must match the calling session';
  end if;

  w_epoch := floor(extract(epoch from now()) / greatest(p_window_seconds, 1))::bigint;
  insert into api_rate_buckets (owner_id, bucket_key, window_epoch, hit_count)
  values (p_owner_id, left(p_bucket, 256), w_epoch, 1)
  on conflict (owner_id, bucket_key, window_epoch)
  do update set hit_count = api_rate_buckets.hit_count + 1
  returning api_rate_buckets.hit_count into c;

  return query select (c <= p_max), c;
end;
$$;

revoke all on function consume_rate(uuid, text, integer, integer) from public;
grant execute on function consume_rate(uuid, text, integer, integer) to authenticated;
