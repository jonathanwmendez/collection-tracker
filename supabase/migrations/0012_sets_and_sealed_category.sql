-- The Sets & Sealed tab was added to the app and the sheet, but never to the category enum,
-- so syncing a sheet with any Sets & Sealed row failed.
alter type item_category add value if not exists 'Sets & Sealed' before 'Other';
