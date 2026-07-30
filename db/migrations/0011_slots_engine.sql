-- Phase 1.4 (FR-SCH-001..020) of pluto-full-implementation-prompt.md — the
-- heart of the system. rooms/resources per FR-SCH-003/BR-002.
--
-- BR-003 (slot locking) and BR-004 (transactional booking) can't use
-- `SELECT ... FOR UPDATE` from application code because the backend talks to
-- Postgres through PostgREST (supabase-py), which has no client-held
-- transactions. Instead:
--   - "hold" a slot via a single atomic conditional UPDATE
--     (`WHERE status = 'available'`) — Postgres serializes concurrent
--     UPDATEs to the same row, so only one caller ever wins.
--   - "book" a slot via the book_slot() plpgsql function below, called
--     through PostgREST's RPC endpoint — the whole read-check-write happens
--     server-side in one real transaction, with a real row lock.

create table rooms (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references branches(id) on delete cascade,
  name text not null,
  is_active boolean not null default true
);

create table resources (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references branches(id) on delete cascade,
  name text not null,
  is_active boolean not null default true
);

create type slot_status as enum (
  'available', 'temporarily_held', 'booked', 'blocked',
  'unavailable', 'reserved', 'overbooked', 'waitlist_only'
);

create table slots (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references branches(id) on delete cascade,
  doctor_id uuid references staff(id) on delete cascade,
  service_id uuid references services(id) on delete set null,
  room_id uuid references rooms(id) on delete set null,
  resource_id uuid references resources(id) on delete set null,
  start_at timestamptz not null,
  end_at timestamptz not null,
  duration_minutes int not null,
  status slot_status not null default 'available',
  held_until timestamptz,
  held_by_session text,
  patient_category_restriction text,
  new_patient_only boolean not null default false,
  existing_patient_only boolean not null default false,
  internal_only boolean not null default false,
  block_reason text,
  created_by uuid references staff(id),
  created_at timestamptz not null default now()
);

create index slots_branch_start_idx on slots (branch_id, start_at);
create index slots_doctor_start_idx on slots (doctor_id, start_at);
create index slots_status_idx on slots (status);

alter table appointments add column slot_id uuid references slots(id) on delete set null;

-- Global booking-window settings (FR-SCH-017..019). One row, like clinic_settings.
alter table clinic_settings
  add column min_booking_lead_minutes int not null default 0,
  add column max_booking_advance_days int not null default 90,
  add column same_day_cutoff_time time;

-- BR-004: confirms a held/available slot and creates its appointment in one
-- real transaction. Returns the new appointment id.
create function book_slot(
  p_slot_id uuid,
  p_patient_id uuid,
  p_held_by_session text,
  p_notes text default null,
  p_source text default 'dashboard'
) returns uuid as $$
declare
  v_slot slots%rowtype;
  v_appointment_id uuid;
begin
  select * into v_slot from slots where id = p_slot_id for update;

  if not found then
    raise exception 'slot % not found', p_slot_id using errcode = 'P0002';
  end if;

  if v_slot.status = 'temporarily_held' then
    if v_slot.held_by_session is distinct from p_held_by_session or v_slot.held_until < now() then
      raise exception 'slot % is held by someone else or the hold expired', p_slot_id using errcode = '23505';
    end if;
  elsif v_slot.status <> 'available' then
    raise exception 'slot % is not bookable (status=%)', p_slot_id, v_slot.status using errcode = '23505';
  end if;

  update slots set status = 'booked', held_until = null, held_by_session = null where id = p_slot_id;

  insert into appointments (branch_id, patient_id, staff_id, service_id, scheduled_at, duration_minutes, source, notes, slot_id)
  values (v_slot.branch_id, p_patient_id, v_slot.doctor_id, v_slot.service_id, v_slot.start_at, v_slot.duration_minutes, p_source, p_notes, p_slot_id)
  returning id into v_appointment_id;

  return v_appointment_id;
end;
$$ language plpgsql;
