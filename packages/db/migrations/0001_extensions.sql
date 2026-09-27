-- Extensions required by the spec: pgvector for embeddings, pg_trgm for
-- trigram search on titles (SPEC.md section 8, indexes).
create extension if not exists vector;
create extension if not exists pg_trgm;
create extension if not exists pgcrypto;

-- Shared trigger to keep updated_at current on every table (rule: every
-- table has owner_id + created_at/updated_at per CLAUDE.md and SPEC.md section 8).
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;
