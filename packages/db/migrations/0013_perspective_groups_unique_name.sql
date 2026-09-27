-- Same reasoning as 0012: lets the seed-import stage upsert perspective
-- groups idempotently by name.
alter table perspective_groups add constraint perspective_groups_owner_name_key unique (owner_id, name);
