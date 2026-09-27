-- Lets the M1 seed-import stage upsert idempotently (CLAUDE.md rule 3:
-- re-running a stage must not duplicate rows).
alter table sources add constraint sources_owner_name_key unique (owner_id, name);
