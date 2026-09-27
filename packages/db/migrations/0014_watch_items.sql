-- SPEC.md section 4.3: "New output appears in a 'From your watchlist'
-- section regardless of topic scoring." No join table existed yet to link
-- a watch to the items it surfaced.

create table watch_items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  watch_id uuid not null references watches (id) on delete cascade,
  item_id uuid not null references items (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint watch_items_watch_item_key unique (watch_id, item_id)
);
create trigger watch_items_set_updated_at before update on watch_items
  for each row execute function set_updated_at();

alter table watch_items enable row level security;
create policy watch_items_select_own on watch_items for select using (owner_id = auth.uid());
create policy watch_items_insert_own on watch_items for insert with check (owner_id = auth.uid());
create policy watch_items_update_own on watch_items for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy watch_items_delete_own on watch_items for delete using (owner_id = auth.uid());
