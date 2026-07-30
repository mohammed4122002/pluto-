-- Phase C surfaced 3 real gaps in the status_transitions matrix: paths my new
-- scheduling.py/queue.py code actually exercises but that had no matching row,
-- which would 409 in ordinary use (not just edge cases).

-- appointments default to 'requested' on creation — rescheduling a not-yet-
-- confirmed appointment is a completely normal case, not just confirmed/patient_confirmed.
insert into status_transitions (from_status, to_status, allowed_roles)
values ('requested', 'rescheduled', array['patient','receptionist','call_center_agent','clinic_manager','branch_manager','system_administrator']);

-- queue.start_ticket allows starting from ticket status 'waiting' directly
-- (skipping the formal "call" step for urgent walk-ins), but the matching
-- appointment status transition only existed for called->in_consultation.
insert into status_transitions (from_status, to_status, allowed_roles)
values ('waiting', 'in_consultation', array['nurse','doctor','clinic_manager','branch_manager','system_administrator']);

-- bulk_cancel_appointments (doctor-absence, FR-ABS-*) targets appointments in
-- confirmed/patient_confirmed/requested/checked_in/waitlisted status, but
-- cancelled_by_doctor only accepted 'confirmed' — the other statuses would
-- silently fail to cancel (caught and skipped by the bulk-cancel loop).
insert into status_transitions (from_status, to_status, allowed_roles)
values
  ('patient_confirmed', 'cancelled_by_doctor', array['doctor','clinic_manager','branch_manager','system_administrator']),
  ('requested', 'cancelled_by_doctor', array['doctor','clinic_manager','branch_manager','system_administrator']),
  ('checked_in', 'cancelled_by_doctor', array['doctor','clinic_manager','branch_manager','system_administrator']),
  ('waitlisted', 'cancelled_by_doctor', array['doctor','clinic_manager','branch_manager','system_administrator']);
