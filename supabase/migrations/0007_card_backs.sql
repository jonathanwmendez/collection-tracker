-- Collection Tracker: front and back photos for cards.
-- Run this once in the Supabase SQL editor, after 0006_hardening.sql.

-- Which side of a card a photo shows. Filled in by the sync for card tabs: the Photo column is the
-- front, the Back Photo column is the back. Empty for everything else.
alter table photos add column if not exists side text check (side in ('front', 'back'));
