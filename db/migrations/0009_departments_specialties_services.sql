-- Phase 1.2 (FR-SRV-001..015) of pluto-full-implementation-prompt.md.

create table departments (
  id uuid primary key default gen_random_uuid(),
  name_ar text not null,
  name_en text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table specialties (
  id uuid primary key default gen_random_uuid(),
  department_id uuid references departments(id) on delete set null,
  parent_id uuid references specialties(id) on delete set null,
  name_ar text not null,
  name_en text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table doctor_specialties (
  staff_id uuid not null references staff(id) on delete cascade,
  specialty_id uuid not null references specialties(id) on delete cascade,
  primary key (staff_id, specialty_id)
);

create table visit_types (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name_ar text not null,
  name_en text not null,
  is_active boolean not null default true
);

insert into visit_types (code, name_ar, name_en) values
  ('in_person', 'حضوري', 'In-Person'),
  ('telemedicine', 'عن بعد', 'Telemedicine'),
  ('home_visit', 'زيارة منزلية', 'Home Visit');

alter table services
  add column department_id uuid references departments(id) on delete set null,
  add column specialty_id uuid references specialties(id) on delete set null,
  add column deposit_amount numeric,
  add column prep_instructions text,
  add column required_documents text,
  add column min_age int,
  add column patient_gender_restriction text check (patient_gender_restriction in ('male', 'female')),
  add column approval_requirement text not null default 'none'
    check (approval_requirement in ('none', 'doctor', 'admin', 'previous_visit'));

-- FR-SRV-005/006: per-doctor duration override for a service.
create table service_doctor_duration (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references services(id) on delete cascade,
  staff_id uuid not null references staff(id) on delete cascade,
  duration_minutes int not null,
  unique (service_id, staff_id)
);

-- FR-SRV-008: variable pricing. Null dimensions mean "applies regardless".
create table service_pricing_rules (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references services(id) on delete cascade,
  branch_id uuid references branches(id) on delete cascade,
  staff_id uuid references staff(id) on delete cascade,
  patient_category text,
  visit_type_id uuid references visit_types(id) on delete set null,
  booking_time_rule text,
  price numeric not null,
  created_at timestamptz not null default now()
);

-- FR-SRV-015: follow-up/bundled service chains.
create table service_sequences (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references services(id) on delete cascade,
  next_service_id uuid not null references services(id) on delete cascade,
  order_index int not null default 1,
  is_required boolean not null default false,
  recommended_gap_days int,
  unique (service_id, next_service_id)
);
