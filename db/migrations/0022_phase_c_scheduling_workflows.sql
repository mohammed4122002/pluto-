-- Phase C: search/reschedule/cancel policies, waitlist, check-in + queue, no-show.

create table cancellation_policies (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid references branches(id) on delete cascade,
  service_id uuid references services(id) on delete cascade,
  doctor_id uuid references staff(id) on delete cascade,
  hours_before_threshold integer not null default 24,
  cancellation_fee_type text not null default 'none' check (cancellation_fee_type in ('none', 'fixed', 'percentage')),
  cancellation_fee_value numeric not null default 0,
  no_show_fee_type text not null default 'none' check (no_show_fee_type in ('none', 'fixed', 'percentage')),
  no_show_fee_value numeric not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index idx_cancellation_policies_lookup on cancellation_policies (branch_id, service_id, doctor_id) where is_active;

create table waitlist (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients(id) on delete cascade,
  branch_id uuid not null references branches(id) on delete cascade,
  doctor_id uuid references staff(id) on delete cascade,
  service_id uuid references services(id) on delete cascade,
  preferred_days jsonb,
  preferred_time_window text,
  max_wait_days integer,
  accepts_alternative_doctor boolean not null default true,
  accepts_alternative_branch boolean not null default false,
  medical_priority integer not null default 0,
  status text not null default 'active' check (status in ('active', 'offered', 'booked', 'expired', 'cancelled')),
  created_at timestamptz not null default now()
);

create index idx_waitlist_matching on waitlist (branch_id, service_id, status) where status = 'active';

create table waitlist_offers (
  id uuid primary key default gen_random_uuid(),
  waitlist_id uuid not null references waitlist(id) on delete cascade,
  slot_id uuid not null references slots(id) on delete cascade,
  offered_at timestamptz not null default now(),
  expires_at timestamptz not null,
  response text check (response in ('accepted', 'declined', 'expired')),
  responded_at timestamptz
);

create index idx_waitlist_offers_pending on waitlist_offers (slot_id) where response is null;

create table queues (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references branches(id) on delete cascade,
  doctor_id uuid references staff(id) on delete cascade,
  room_id uuid references rooms(id) on delete set null,
  service_id uuid references services(id) on delete set null,
  queue_date date not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (branch_id, doctor_id, queue_date)
);

create table queue_tickets (
  id uuid primary key default gen_random_uuid(),
  queue_id uuid not null references queues(id) on delete cascade,
  appointment_id uuid not null references appointments(id) on delete cascade,
  patient_id uuid not null references patients(id) on delete cascade,
  ticket_number integer not null,
  priority_level text not null default 'normal' check (priority_level in ('normal', 'emergency', 'elderly', 'special_needs', 'child', 'critical', 'vip')),
  status text not null default 'waiting' check (status in ('waiting', 'called', 'in_progress', 'done', 'skipped')),
  arrival_status text check (arrival_status in ('early', 'on_time', 'late', 'very_late')),
  checked_in_at timestamptz not null default now(),
  called_at timestamptz,
  started_at timestamptz,
  ended_at timestamptz,
  estimated_entry_time timestamptz
);

create index idx_queue_tickets_active on queue_tickets (queue_id, status);

alter table clinic_settings add column no_show_grace_minutes integer not null default 15;

-- RLS: the backend talks to Postgres exclusively via the service_role key
-- (bypasses RLS); enabling it here is defense-in-depth, matching every other
-- table in this schema (see 0012_enable_rls_new_tables.sql).
alter table cancellation_policies enable row level security;
alter table waitlist enable row level security;
alter table waitlist_offers enable row level security;
alter table queues enable row level security;
alter table queue_tickets enable row level security;

insert into permissions (resource, action, code, description) values
  ('waitlist', 'view', 'waitlist.view', null),
  ('waitlist', 'manage', 'waitlist.manage', 'add/cancel waitlist entries, respond to offers on a patient''s behalf'),
  ('queue', 'view', 'queue.view', null),
  ('queue', 'manage', 'queue.manage', 'check-in patients, call/skip/reorder/transfer queue tickets');

insert into role_permissions (role_id, permission_id)
select r.id, p.id from (values
  ('receptionist', 'waitlist.view'), ('receptionist', 'waitlist.manage'),
  ('call_center_agent', 'waitlist.view'), ('call_center_agent', 'waitlist.manage'),
  ('telemedicine_coordinator', 'waitlist.view'), ('telemedicine_coordinator', 'waitlist.manage'),
  ('doctor', 'waitlist.view'),
  ('nurse', 'waitlist.view'),

  ('receptionist', 'queue.view'), ('receptionist', 'queue.manage'),
  ('nurse', 'queue.view'), ('nurse', 'queue.manage'),
  ('doctor', 'queue.view'),

  ('branch_manager', 'waitlist.view'), ('branch_manager', 'waitlist.manage'),
  ('branch_manager', 'queue.view'), ('branch_manager', 'queue.manage')
) as grants(role_code, permission_code)
join roles r on r.code = grants.role_code
join permissions p on p.code = grants.permission_code;

insert into role_permissions (role_id, permission_id)
select r.id, p.id from roles r
cross join permissions p
where r.code in ('clinic_manager', 'system_administrator')
  and p.code in ('waitlist.view', 'waitlist.manage', 'queue.view', 'queue.manage');
