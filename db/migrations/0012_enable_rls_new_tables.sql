-- Every table from 0001_init.sql has RLS enabled with no policies (only the
-- backend's service_role key can read/write, bypassing RLS entirely; anon/
-- authenticated keys see nothing). Migrations 0006-0011 missed this for the
-- new tables they introduced — closing that gap here.

alter table roles enable row level security;
alter table permissions enable row level security;
alter table role_permissions enable row level security;
alter table user_roles enable row level security;
alter table audit_log enable row level security;

alter table branch_working_hours enable row level security;
alter table branch_holidays enable row level security;

alter table departments enable row level security;
alter table specialties enable row level security;
alter table doctor_specialties enable row level security;
alter table visit_types enable row level security;
alter table service_doctor_duration enable row level security;
alter table service_pricing_rules enable row level security;
alter table service_sequences enable row level security;

alter table doctor_limits enable row level security;
alter table doctor_leaves enable row level security;
alter table doctor_substitutes enable row level security;

alter table rooms enable row level security;
alter table resources enable row level security;
alter table slots enable row level security;
