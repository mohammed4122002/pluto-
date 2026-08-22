-- Booking-engine gap: nothing capped how many times an appointment could be
-- rescheduled. Each reschedule keeps the old row (status 'rescheduled') and
-- inserts a fresh one linked via previous_appointment_id, so a chain has no
-- natural end -- reschedule_count tracks the chain length on the row itself
-- (copied forward +1 on every reschedule) rather than needing a recursive
-- walk up previous_appointment_id just to enforce a limit.

alter table clinic_settings
  add column max_reschedules_allowed int;
-- null = unlimited, matching every other "no configured limit" column on
-- this table (e.g. max_booking_advance_days has a real default; this one
-- doesn't, because clinics differ on whether they want a cap at all).

alter table appointments
  add column reschedule_count int not null default 0;
