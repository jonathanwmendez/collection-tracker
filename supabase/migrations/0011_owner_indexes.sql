-- The sync and the morning repricing read every photo and price check by owner. Without these indexes,
-- each of those reads scans the whole table once the collection grows.
create index if not exists photos_user_idx on photos (user_id);
create index if not exists price_checks_user_idx on price_checks (user_id);
