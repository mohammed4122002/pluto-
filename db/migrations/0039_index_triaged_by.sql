-- The Supabase performance advisor flagged queue_tickets_triaged_by_fkey
-- (added in 0038) as unindexed, same class of issue as 0037.
create index if not exists idx_queue_tickets_triaged_by on public.queue_tickets (triaged_by);
