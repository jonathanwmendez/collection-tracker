-- Collection Tracker: groundwork for scanning, certificates, and free pricing.
-- Run this once in the Supabase SQL editor, after 0008_scale.sql.

-- A price from current eBay listings (not sales) is shown as "asking", not verified.
alter type value_status add value if not exists 'asking';

-- Where the item is kept, its ID in a card database, and its certificate of authenticity.
alter table items add column if not exists location text;
alter table items add column if not exists catalog_id text;
alter table items add column if not exists authenticator text;
alter table items add column if not exists cert_number text;

-- A photo can also be the certificate.
alter table photos drop constraint if exists photos_side_check;
alter table photos add constraint photos_side_check check (side in ('front', 'back', 'coa'));

-- Cards priced at or above this get a sold-price check from Claude (Summary tab: "Claude Check Over ($)").
alter table settings add column if not exists claude_threshold numeric(10, 2) not null default 10 check (claude_threshold >= 0);

create index if not exists items_location_idx on items (user_id, location);
create index if not exists items_catalog_idx on items (user_id, catalog_id);
