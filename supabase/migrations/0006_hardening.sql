-- Collection Tracker: fixes from Supabase's security advisor.
-- Run this once in the Supabase SQL editor, after 0005_cost_and_grading.sql.

-- Pin the trigger function's search path so it can't be redirected to another schema's objects.
alter function public.touch_updated_at() set search_path = '';

-- Supabase's "automatic RLS" helper runs as an event trigger. Nobody needs to call it through the API.
do $$
begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'rls_auto_enable') then
    revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
  end if;
end $$;
