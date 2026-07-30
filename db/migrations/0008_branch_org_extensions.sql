-- Phase 1.1 (FR-ORG-001..012) of pluto-full-implementation-prompt.md.
-- branch_payment_methods is intentionally NOT created here — it belongs with
-- the payments module (Phase 4.2) so it isn't an orphan table with no owner.
-- branch_services already exists from 0001_init.sql and covers FR-ORG-009.

alter table branches
  add column code text unique,
  add column lat double precision,
  add column lng double precision,
  add column currency text,
  add column default_language text not null default 'ar';

create table branch_working_hours (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references branches(id) on delete cascade,
  day_of_week int not null check (day_of_week between 0 and 6),
  period text not null check (period in ('morning', 'evening')),
  start_time time not null,
  end_time time not null,
  unique (branch_id, day_of_week, period)
);

-- is_full_day=false uses start_time/end_time for a partial-day closure window.
create table branch_holidays (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references branches(id) on delete cascade,
  holiday_date date not null,
  reason text,
  is_full_day boolean not null default true,
  start_time time,
  end_time time,
  created_at timestamptz not null default now(),
  unique (branch_id, holiday_date)
);

create index branch_holidays_branch_date_idx on branch_holidays (branch_id, holiday_date);
