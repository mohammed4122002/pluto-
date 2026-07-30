-- Import system: saved mapping profiles, tracked import jobs with per-row
-- detail (needed for dry-run preview, error reports, and undo), and
-- provenance + soft-delete on every importable table so an import can be
-- reversed without ever hard-deleting a row.

create table import_profiles (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  data_type text not null check (data_type in ('patients', 'services', 'staff', 'appointments')),
  source_type text not null check (source_type in ('file', 'google_sheets', 'postgres')),
  branch_id uuid references branches(id) on delete set null,
  column_mapping jsonb not null default '{}'::jsonb,
  options jsonb not null default '{}'::jsonb,
  source_config jsonb not null default '{}'::jsonb,
  source_credentials_encrypted text,
  sync_interval_hours int,
  next_sync_at timestamptz,
  last_synced_at timestamptz,
  last_sync_status text,
  last_sync_error text,
  created_by uuid references staff(id),
  created_at timestamptz not null default now()
);

create table import_jobs (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references import_profiles(id) on delete set null,
  data_type text not null check (data_type in ('patients', 'services', 'staff', 'appointments')),
  source_type text not null check (source_type in ('file', 'google_sheets', 'postgres')),
  source_label text,
  branch_id uuid references branches(id) on delete set null,
  column_mapping jsonb not null default '{}'::jsonb,
  options jsonb not null default '{}'::jsonb,
  status text not null default 'dry_run' check (status in ('dry_run', 'running', 'completed', 'failed')),
  will_create int not null default 0,
  will_update int not null default 0,
  will_skip int not null default 0,
  will_error int not null default 0,
  created_count int not null default 0,
  updated_count int not null default 0,
  skipped_count int not null default 0,
  error_count int not null default 0,
  undo_status text not null default 'not_applicable' check (undo_status in ('not_applicable', 'available', 'undone', 'refused', 'expired')),
  undo_deadline timestamptz,
  error_message text,
  created_by uuid references staff(id),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index idx_import_jobs_created on import_jobs (created_at desc);

create table import_job_rows (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references import_jobs(id) on delete cascade,
  row_number int not null,
  action text not null check (action in ('create', 'update', 'skip', 'error')),
  entity_id uuid,
  reason text,
  raw_data jsonb not null default '{}'::jsonb,
  previous_values jsonb
);

create index idx_import_job_rows_job on import_job_rows (job_id);
create index idx_import_job_rows_entity on import_job_rows (entity_id) where entity_id is not null;

alter table patients add column deleted_at timestamptz;
alter table patients add column created_by_import_job_id uuid references import_jobs(id) on delete set null;

alter table services add column deleted_at timestamptz;
alter table services add column created_by_import_job_id uuid references import_jobs(id) on delete set null;

alter table staff add column deleted_at timestamptz;
alter table staff add column created_by_import_job_id uuid references import_jobs(id) on delete set null;

alter table appointments add column deleted_at timestamptz;
alter table appointments add column created_by_import_job_id uuid references import_jobs(id) on delete set null;

alter table import_profiles enable row level security;
alter table import_jobs enable row level security;
alter table import_job_rows enable row level security;

insert into permissions (resource, action, code, description) values
  ('import', 'view', 'import.view', 'view import history, profiles, and job detail'),
  ('import', 'undo', 'import.undo', 'undo a completed import job within its time-boxed window');

insert into role_permissions (role_id, permission_id)
select r.id, p.id from (values
  ('receptionist', 'import.view'),
  ('call_center_agent', 'import.view'),
  ('branch_manager', 'import.view'), ('branch_manager', 'import.undo')
) as grants(role_code, permission_code)
join roles r on r.code = grants.role_code
join permissions p on p.code = grants.permission_code;

insert into role_permissions (role_id, permission_id)
select r.id, p.id from roles r
cross join permissions p
where r.code in ('clinic_manager', 'system_administrator')
  and p.code in ('import.view', 'import.undo');
