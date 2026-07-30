-- Phase 1.3 (FR-PRV-001..015) of pluto-full-implementation-prompt.md.
-- doctor_branch_schedule (FR-PRV-004, per-branch hours) is already covered by
-- the existing doctor_availability table from 0001_init.sql — not duplicated.

alter table staff
  add column full_name_en text,
  add column photo_url text,
  add column gender text check (gender in ('male', 'female')),
  add column qualification text,
  add column years_experience int,
  add column languages text[],
  add column bio text,
  add column availability_status text not null default 'available'
    check (availability_status in ('available', 'on_leave', 'inactive'));

-- One row per doctor. FR-PRV-006..009.
create table doctor_limits (
  staff_id uuid primary key references staff(id) on delete cascade,
  max_patients_per_day int,
  max_consecutive_minutes int,
  buffer_before_minutes int not null default 0,
  buffer_after_minutes int not null default 0,
  break_start_time time,
  break_end_time time
);

-- FR-PRV-010/011: planned leave or emergency absence.
create table doctor_leaves (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references staff(id) on delete cascade,
  start_at timestamptz not null,
  end_at timestamptz not null,
  reason text,
  leave_type text not null default 'planned' check (leave_type in ('planned', 'emergency')),
  created_at timestamptz not null default now()
);

create index doctor_leaves_staff_window_idx on doctor_leaves (staff_id, start_at, end_at);

-- FR-PRV-012: covering doctor during staff_id's leave window.
create table doctor_substitutes (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references staff(id) on delete cascade,
  substitute_staff_id uuid not null references staff(id) on delete cascade,
  branch_id uuid references branches(id) on delete cascade,
  start_at timestamptz not null,
  end_at timestamptz not null,
  created_at timestamptz not null default now()
);
