-- Admins can put Drive files in an order of their own within a folder (lower first); files with no
-- order come after, by name. Like hidden_at, the sync never touches this column.

alter table public.drive_files add column sort_order int check (sort_order between 0 and 9999);
grant update (sort_order) on public.drive_files to authenticated;
