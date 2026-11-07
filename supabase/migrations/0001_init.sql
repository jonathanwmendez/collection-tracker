-- Collection Tracker: initial schema.
-- Run this once in the Supabase SQL editor (or with `supabase db push`).

create extension if not exists pgcrypto;

-- Categories mirror the tabs in the Collection Tracker Google Sheet.
create type item_category as enum (
  'Sports Cards', 'Magic: The Gathering', 'Yu-Gi-Oh!', 'Pokémon',
  'Figures', 'Magazines', 'Newspapers', 'Ornaments', 'Other'
);
create type item_status as enum ('Keep', 'Sell', 'Listed', 'Sold');
-- estimate: Claude's guess, not yet checked against sales
-- verified: backed by recent sold listings or a market price
-- unverifiable: checked, but not enough sales data was found
create type value_status as enum ('estimate', 'verified', 'unverifiable');
create type price_method as enum ('claude_estimate', 'web_search', 'tcgplayer', 'manual');

-- One row per item in the collection.
create table items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  category item_category not null,
  name text not null check (length(trim(name)) > 0),
  -- Category-specific fields, keyed by the sheet's column names (e.g. {"Year": "1996", "Line / Brand": "Playmates"}).
  details jsonb not null default '{}'::jsonb,
  condition text,
  quantity integer not null default 1 check (quantity > 0),
  market_value numeric(10, 2) check (market_value >= 0),
  value_status value_status not null default 'estimate',
  last_checked date,
  status item_status not null default 'Keep',
  notes text not null default '',
  -- Where the item lives in the Google Sheet, for syncing.
  sheet_row integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index items_user_category_idx on items (user_id, category);
create index items_needs_price_idx on items (user_id, last_checked nulls first);

-- Photos: the full-size file lives in Google Drive; a small preview lives in Supabase Storage.
create table photos (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references items (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  position smallint not null default 0,
  drive_file_id text,
  drive_url text,
  preview_path text,
  created_at timestamptz not null default now()
);
create index photos_item_idx on photos (item_id, position);

-- Every price check is kept, so the app can chart value over time.
create table price_checks (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references items (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  checked_at timestamptz not null default now(),
  value numeric(10, 2) check (value >= 0),
  method price_method not null,
  sample_size integer,
  sources jsonb not null default '[]'::jsonb,
  summary text not null default ''
);
create index price_checks_item_idx on price_checks (item_id, checked_at desc);

-- Google refresh tokens, so the app can reach Drive and Sheets between sign-ins.
-- No policies: only the server (secret key) can read or write this table.
create table google_tokens (
  user_id uuid primary key references auth.users (id) on delete cascade,
  refresh_token text not null,
  updated_at timestamptz not null default now()
);

-- Per-user settings, such as which Google Sheet to keep in sync.
create table settings (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  sheet_id text,
  drive_root_folder_id text,
  drive_category_folders jsonb not null default '{}'::jsonb,
  reprice_after_days integer not null default 90 check (reprice_after_days > 0),
  updated_at timestamptz not null default now()
);

-- Keep updated_at current.
create or replace function touch_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;
create trigger items_touch before update on items for each row execute function touch_updated_at();
create trigger settings_touch before update on settings for each row execute function touch_updated_at();

-- Row-level security: each person sees and changes only their own rows.
alter table items enable row level security;
alter table photos enable row level security;
alter table price_checks enable row level security;
alter table google_tokens enable row level security;
alter table settings enable row level security;

create policy "own items" on items for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own photos" on photos for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own price checks" on price_checks for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own settings" on settings for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Totals by category, for the Value tab and the sheet's Summary.
create view category_totals with (security_invoker = true) as
select
  user_id,
  category,
  count(*) as items,
  sum(quantity) as pieces,
  coalesce(sum(quantity * market_value), 0) as total_value,
  count(*) filter (where value_status = 'estimate') as unverified
from items
group by user_id, category;

-- Private bucket for photo previews. Files are stored under "<user id>/...".
insert into storage.buckets (id, name, public) values ('previews', 'previews', false)
on conflict (id) do nothing;

create policy "own previews: read" on storage.objects for select to authenticated
  using (bucket_id = 'previews' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "own previews: add" on storage.objects for insert to authenticated
  with check (bucket_id = 'previews' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "own previews: delete" on storage.objects for delete to authenticated
  using (bucket_id = 'previews' and (storage.foldername(name))[1] = (select auth.uid())::text);
