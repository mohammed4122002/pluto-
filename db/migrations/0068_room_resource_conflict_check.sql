-- Booking-engine gap: rooms/resources and slots.room_id/resource_id have
-- existed since 0011, but nothing anywhere ever assigns them (confirmed by
-- grep across backend/, ai-services/, frontend/ -- no write path touches
-- either column), so this activates a currently-dormant guard rather than
-- changing today's live behavior: every slot booked today still has
-- room_id/resource_id = null, so the new checks below are no-ops until a
-- future feature actually starts assigning rooms to slots.
--
-- The check is scoped to the slots table itself (room_id/resource_id +
-- overlapping [start_at, end_at) + status = 'booked'), matching book_slot()'s
-- existing design where a slot row's own status is the single source of
-- truth for whether it's taken -- not a second query against appointments.
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

  if v_slot.room_id is not null then
    select id into v_conflict_id from slots
      where room_id = v_slot.room_id and id <> v_slot.id and status = 'booked'
        and start_at < v_slot.end_at and end_at > v_slot.start_at
      limit 1;
    if found then
      raise exception 'room % already booked for an overlapping time (conflicting slot %)', v_slot.room_id, v_conflict_id using errcode = '23505';
    end if;
  end if;

  if v_slot.resource_id is not null then
    select id into v_conflict_id from slots
      where resource_id = v_slot.resource_id and id <> v_slot.id and status = 'booked'
        and start_at < v_slot.end_at and end_at > v_slot.start_at
      limit 1;
    if found then
      raise exception 'resource % already booked for an overlapping time (conflicting slot %)', v_slot.resource_id, v_conflict_id using errcode = '23505';
    end if;
  end if;

  update slots set status = 'booked', held_until = null, held_by_session = null where id = p_slot_id;

  insert into appointments (branch_id, patient_id, staff_id, service_id, scheduled_at, duration_minutes, source, notes, slot_id)
  values (v_slot.branch_id, p_patient_id, v_slot.doctor_id, v_slot.service_id, v_slot.start_at, v_slot.duration_minutes, p_source, p_notes, p_slot_id)
  returning id into v_appointment_id;

  return v_appointment_id;
end;
$$ language plpgsql;

-- CREATE OR REPLACE FUNCTION does not preserve proconfig (search_path) --
-- re-pin it exactly as 0013_function_search_path_hardening.sql originally did.
alter function book_slot(uuid, uuid, text, text, text) set search_path = public;
