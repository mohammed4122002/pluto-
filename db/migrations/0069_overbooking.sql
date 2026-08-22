-- Booking-engine gap: 'overbooked'/'waitlist_only' have been valid
-- slot_status values since 0011, but nothing ever set slot_capacity above 1
-- or read allow_overbooking, so a slot could only ever hold exactly one
-- appointment. Both new columns default to today's behavior (capacity 1,
-- overbooking off), so this is inert until a clinic opts in per-slot
-- (slot_capacity) and clinic-wide (allow_overbooking/max_overbooking).

alter table slots
  add column slot_capacity int not null default 1;

alter table clinic_settings
  add column allow_overbooking boolean not null default false,
  add column max_overbooking int not null default 0;

-- book_slot() now supports more than one live appointment per slot, up to
-- slot_capacity (or slot_capacity + max_overbooking when allow_overbooking
-- is on) -- and folds in 0068's room/resource conflict check, since both
-- changes touch the same function body and CREATE OR REPLACE fully replaces
-- it. Below slot_capacity=1/allow_overbooking=false (today's default for
-- every existing row), this behaves exactly as before: one booking flips the
-- slot straight to 'booked', full stop.
create or replace function book_slot(
  p_slot_id uuid,
  p_patient_id uuid,
  p_held_by_session text,
  p_notes text default null,
  p_source text default 'dashboard'
) returns uuid as $$
declare
  v_slot slots%rowtype;
  v_appointment_id uuid;
  v_conflict_id uuid;
  v_active_count int;
  v_effective_capacity int;
  v_allow_overbooking boolean;
  v_max_overbooking int;
  v_new_status slot_status;
begin
  select * into v_slot from slots where id = p_slot_id for update;

  if not found then
    raise exception 'slot % not found', p_slot_id using errcode = 'P0002';
  end if;

  if v_slot.status = 'temporarily_held' then
    if v_slot.held_by_session is distinct from p_held_by_session or v_slot.held_until < now() then
      raise exception 'slot % is held by someone else or the hold expired', p_slot_id using errcode = '23505';
    end if;
  elsif v_slot.status not in ('available', 'overbooked') then
    -- 'waitlist_only' is deliberately excluded: capacity (including any
    -- overbooking allowance) is already exhausted, so this slot only
    -- reopens through the waitlist-offer flow, not a direct booking call.
    raise exception 'slot % is not bookable (status=%)', p_slot_id, v_slot.status using errcode = '23505';
  end if;

  select coalesce(cs.allow_overbooking, false), coalesce(cs.max_overbooking, 0)
    into v_allow_overbooking, v_max_overbooking
    from clinic_settings cs limit 1;

  v_effective_capacity := coalesce(v_slot.slot_capacity, 1)
    + (case when v_allow_overbooking then v_max_overbooking else 0 end);

  select count(*) into v_active_count from appointments
    where slot_id = v_slot.id
      and status not in ('cancelled', 'cancelled_by_patient', 'cancelled_by_clinic', 'cancelled_by_doctor',
                          'no_show', 'rejected', 'expired', 'rescheduled');

  if v_active_count >= v_effective_capacity then
    raise exception 'slot % is fully booked (capacity reached)', p_slot_id using errcode = '23505';
  end if;

  if v_slot.room_id is not null then
    select id into v_conflict_id from slots
      where room_id = v_slot.room_id and id <> v_slot.id and status in ('booked', 'overbooked', 'waitlist_only')
        and start_at < v_slot.end_at and end_at > v_slot.start_at
      limit 1;
    if found then
      raise exception 'room % already booked for an overlapping time (conflicting slot %)', v_slot.room_id, v_conflict_id using errcode = '23505';
    end if;
  end if;

  if v_slot.resource_id is not null then
    select id into v_conflict_id from slots
      where resource_id = v_slot.resource_id and id <> v_slot.id and status in ('booked', 'overbooked', 'waitlist_only')
        and start_at < v_slot.end_at and end_at > v_slot.start_at
      limit 1;
    if found then
      raise exception 'resource % already booked for an overlapping time (conflicting slot %)', v_slot.resource_id, v_conflict_id using errcode = '23505';
    end if;
  end if;

  insert into appointments (branch_id, patient_id, staff_id, service_id, scheduled_at, duration_minutes, source, notes, slot_id)
  values (v_slot.branch_id, p_patient_id, v_slot.doctor_id, v_slot.service_id, v_slot.start_at, v_slot.duration_minutes, p_source, p_notes, p_slot_id)
  returning id into v_appointment_id;

  v_active_count := v_active_count + 1;
  v_new_status := case
    when v_effective_capacity <= 1 then 'booked'
    when v_active_count >= v_effective_capacity then 'waitlist_only'
    when v_active_count >= coalesce(v_slot.slot_capacity, 1) then 'overbooked'
    else 'available'
  end;

  update slots set status = v_new_status, held_until = null, held_by_session = null where id = p_slot_id;

  return v_appointment_id;
end;
$$ language plpgsql;

alter function book_slot(uuid, uuid, text, text, text) set search_path = public;
