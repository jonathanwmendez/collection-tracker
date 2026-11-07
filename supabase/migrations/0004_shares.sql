-- Collection Tracker: view-only share links.
-- Run this once in the Supabase SQL editor, after 0003_access.sql.
--
-- Anyone with a link's token can view the collection it covers, without signing in.
-- The app's server checks the token and serves only what the link allows.

create table shares (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  token text not null unique check (length(token) >= 20),
  title text not null default '' check (length(title) <= 100),
  -- Null means every category.
  categories item_category[],
  show_values boolean not null default true,
  show_notes boolean not null default false,
  expires_at timestamptz,
  view_count integer not null default 0,
  last_viewed_at timestamptz,
  created_at timestamptz not null default now()
);
create index shares_user_idx on shares (user_id);

alter table shares enable row level security;
create policy "own shares" on shares for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

grant select, insert, update, delete on shares to authenticated;
grant all on shares to service_role;
