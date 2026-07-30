-- Patient management: duplicate detection + merge, guardian enforcement
-- (BR-011), patient classification tags.

alter table patients add column is_merged_into uuid references patients(id) on delete set null;

create table patient_duplicates (
  id uuid primary key default gen_random_uuid(),
  patient_a_id uuid not null references patients(id) on delete cascade,
  patient_b_id uuid not null references patients(id) on delete cascade,
  match_score numeric not null,
  match_reasons jsonb not null default '[]'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'confirmed_duplicate', 'not_duplicate')),
  reviewed_by uuid references staff(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (patient_a_id, patient_b_id)
);

create index idx_patient_duplicates_pending on patient_duplicates (status) where status = 'pending';

create table patient_tags (
  patient_id uuid not null references patients(id) on delete cascade,
  tag text not null check (tag in ('new', 'existing', 'vip', 'corporate', 'self_pay', 'chronic', 'high_risk', 'frequent_no_show', 'blacklisted')),
  tagged_by uuid references staff(id),
  tagged_at timestamptz not null default now(),
  primary key (patient_id, tag)
);

alter table patient_duplicates enable row level security;
alter table patient_tags enable row level security;

insert into permissions (resource, action, code, description) values
  ('patient', 'merge', 'patient.merge', 'merge duplicate patient records — moves all appointments/conversations/payments to the survivor'),
  ('patient', 'tag', 'patient.tag', null);

insert into role_permissions (role_id, permission_id)
select r.id, p.id from (values
  ('receptionist', 'patient.tag'),
  ('call_center_agent', 'patient.tag'),
  ('branch_manager', 'patient.tag'), ('branch_manager', 'patient.merge')
) as grants(role_code, permission_code)
join roles r on r.code = grants.role_code
join permissions p on p.code = grants.permission_code;

insert into role_permissions (role_id, permission_id)
select r.id, p.id from roles r
cross join permissions p
where r.code in ('clinic_manager', 'system_administrator')
  and p.code in ('patient.merge', 'patient.tag');
