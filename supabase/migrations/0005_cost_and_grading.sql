-- Collection Tracker: what you paid, what you sold for, graded prices, alert and grading settings.
-- Run this once in the Supabase SQL editor, after 0004_shares.sql.

alter table items
  add column if not exists paid numeric(12, 2),
  add column if not exists sold_price numeric(12, 2),
  add column if not exists sold_on date,
  add column if not exists psa9 numeric(12, 2),
  add column if not exists psa10 numeric(12, 2);

-- Daily snapshots also keep what you paid and each category's value, for the analytics on the Value page.
alter table value_snapshots
  add column if not exists paid numeric(12, 2),
  add column if not exists by_category jsonb not null default '{}'::jsonb;

-- Settings shared with the sheet's Summary tab.
alter table settings
  add column if not exists alert_change_pct integer,
  add column if not exists grading_cost numeric(10, 2);

-- Sold items are no longer in the collection, so leave them out of the totals.
create or replace view category_totals with (security_invoker = true) as
  select user_id,
    category,
    count(*) as items,
    sum(quantity) as pieces,
    coalesce(sum(quantity::numeric * market_value), 0::numeric) as total_value,
    count(*) filter (where value_status = 'estimate'::value_status) as unverified
  from items
  where status <> 'Sold'
  group by user_id, category;
