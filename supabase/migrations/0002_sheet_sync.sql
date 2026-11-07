-- Collection Tracker: sheet sync, value history, and links.
-- Run this once in the Supabase SQL editor, after 0001_init.sql.

-- Prices that came from the Google Sheet (Claude's scheduled price check, or an edit made in the sheet).
alter type price_method add value if not exists 'sheet';

-- Settings: the Collection Intake link, the sheet's tab IDs, and when the app last synced.
alter table settings
  add column if not exists intake_url text,
  add column if not exists sheet_tabs jsonb not null default '{}'::jsonb,
  add column if not exists last_synced_at timestamptz;

-- Prices are rechecked every 30 days by default (the nightly price check uses the same window).
alter table settings alter column reprice_after_days set default 30;

-- One photo row per Drive file per item.
create unique index if not exists photos_item_drive_idx on photos (item_id, drive_file_id);

-- Matching sheet rows to items during sync.
create index if not exists items_user_row_idx on items (user_id, category, sheet_row);

-- The collection's total value, once per day, for the value-over-time chart.
create table if not exists value_snapshots (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  taken_on date not null,
  total_value numeric(12, 2) not null default 0,
  items integer not null default 0,
  pieces integer not null default 0,
  primary key (user_id, taken_on)
);

alter table value_snapshots enable row level security;
create policy "own snapshots" on value_snapshots for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

grant select, insert, update, delete on value_snapshots to authenticated;
grant all on value_snapshots to service_role;

-- Previews are replaced when a photo changes, so allow updates to your own preview files.
create policy "own previews: update" on storage.objects for update to authenticated
  using (bucket_id = 'previews' and (storage.foldername(name))[1] = (select auth.uid())::text);
