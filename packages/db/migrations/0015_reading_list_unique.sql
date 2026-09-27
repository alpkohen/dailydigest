-- Lets the app upsert idempotently when "saved" feedback adds something to
-- the reading list (SPEC.md section 4.13), instead of creating duplicate
-- rows on repeat saves. Plain (non-partial) unique constraints are needed
-- so Supabase's upsert(..., { onConflict }) can target them by column
-- list; NULLs in item_id/story_id never collide with each other under a
-- unique constraint regardless, which is correct here since exactly one
-- of the two is always set (reading_list_item_or_story check constraint).
alter table reading_list add constraint reading_list_owner_story_key unique (owner_id, story_id);
alter table reading_list add constraint reading_list_owner_item_key unique (owner_id, item_id);
