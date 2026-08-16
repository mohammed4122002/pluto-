-- Was applied directly against the live database (name recovered from
-- list_migrations) without a matching file ever landing in this repo,
-- which briefly left db/migrations/ silently out of sync with the actual
-- schema -- added here so the file history matches what's really applied.
-- Every other table in this schema has RLS enabled with no policies: the
-- API reaches the database through the service key, and PostgREST is meant
-- to be denied outright. coupon_services (0062_coupon_service_groups.sql)
-- was created without this, which is what this migration closes.
alter table coupon_services enable row level security;
