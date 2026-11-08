-- Collection Tracker: keeps syncing fast with large collections.
-- Run this once in the Supabase SQL editor, after 0007_card_backs.sql.

-- A fingerprint of each synced row, so a sync only rewrites rows that changed.
alter table items add column if not exists row_hash text;

-- When the sheet last changed (from Drive), so a sync can be skipped when nothing did.
alter table settings add column if not exists sheet_modified_at timestamptz;
