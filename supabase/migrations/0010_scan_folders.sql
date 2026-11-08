-- Collection Tracker: Drive folders the Scan page saves photos to.
-- Run this once in the Supabase SQL editor, after 0009_scan_groundwork.sql.

-- {"root": "<folder id>", "<category>": "<folder id>"}: "Collection Tracker Scans" and one subfolder per category.
alter table settings add column if not exists scan_folders jsonb not null default '{}'::jsonb;
