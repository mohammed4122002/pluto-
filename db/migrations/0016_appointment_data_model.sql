-- Phase 2.2 appointment data model extension. `source` (0001_init.sql)
-- already covers the doc's "booking_source" — not duplicated.
-- resource_ids is an array since a visit can use more than one resource.

create table guardians (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  phone text,
  email text,
  created_at timestamptz not null default now()
);

-- FR-PAT-008/009, BR-011: a minor must be linked to at least one guardian —
-- enforced in application code when creating a minor patient, not here.
create table patient_guardians (
  patient_id uuid not null references patients(id) on delete cascade,
  guardian_id uuid not null references guardians(id) on delete cascade,
  relationship text,
  is_primary boolean not null default false,
  primary key (patient_id, guardian_id)
);

alter table appointments
  add column appointment_number text unique,
  add column guardian_id uuid references guardians(id) on delete set null,
  add column department_id uuid references departments(id) on delete set null,
  add column specialty_id uuid references specialties(id) on delete set null,
  add column room_id uuid references rooms(id) on delete set null,
  add column resource_ids uuid[],
  add column visit_type_id uuid references visit_types(id) on delete set null,
  add column timezone text,
  add column confirmation_status text not null default 'pending'
    check (confirmation_status in ('pending', 'confirmed', 'declined')),
  add column payment_status text not null default 'unpaid'
    check (payment_status in ('unpaid', 'pending', 'paid', 'refunded', 'partial')),
  add column referral_source text,
  add column reason_for_visit text,
  add column priority text not null default 'normal' check (priority in ('normal', 'urgent', 'emergency')),
  add column created_by uuid references staff(id),
  add column last_modified_by uuid references staff(id),
  add column cancellation_reason text,
  add column rescheduling_reason text,
  add column previous_appointment_id uuid references appointments(id) on delete set null,
  add column parent_appointment_id uuid references appointments(id) on delete set null,
  add column recurrence_id uuid,
  add column queue_number int,
  add column check_in_time timestamptz,
  add column consultation_start_time timestamptz,
  add column completion_time timestamptz,
  add column no_show_flag boolean not null default false,
  add column confirmation_code text,
  add column qr_code text,
  add column meeting_link text,
  add column price numeric,
  add column deposit numeric,
  add column paid_amount numeric not null default 0,
  add column remaining_amount numeric;

alter table guardians enable row level security;
alter table patient_guardians enable row level security;

create index appointments_recurrence_idx on appointments (recurrence_id) where recurrence_id is not null;
