-- Collection Tracker: invite-only access, managed from the app's Admin page.
-- Run this once in the Supabase SQL editor, after 0002_sheet_sync.sql.
--
-- Owners are set with the ADMIN_EMAILS environment variable in Vercel and can always sign in.
-- Everyone else needs a row in members. People without access can ask for it on the login page.

create type member_role as enum ('admin', 'member');

create table members (
  email text primary key check (email = lower(trim(email)) and email like '%@%'),
  role member_role not null default 'member',
  invited_by text,
  created_at timestamptz not null default now()
);

create table access_requests (
  email text primary key check (email = lower(trim(email)) and email like '%@%'),
  name text not null default '' check (length(name) <= 100),
  note text not null default '' check (length(note) <= 500),
  created_at timestamptz not null default now()
);

-- No policies: only the server (secret key) reads or changes these tables.
alter table members enable row level security;
alter table access_requests enable row level security;
grant all on members, access_requests to service_role;

-- The signed-in person's role, or null when they aren't a member.
-- Runs with the owner's rights so it can read members without exposing the table.
create or replace function public.my_role() returns text
language sql stable security definer set search_path = public
as $$
  select role::text from members where email = lower(coalesce(auth.jwt() ->> 'email', ''));
$$;

revoke all on function public.my_role() from public, anon;
grant execute on function public.my_role() to authenticated;
