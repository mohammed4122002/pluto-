-- Package sales need a branch for RBAC scoping (a package payment has no
-- appointment_id to derive branch_id from, unlike ordinary payments). Table
-- is brand new and empty, so no backfill needed.
alter table patient_packages add column branch_id uuid not null references branches(id) on delete cascade;
