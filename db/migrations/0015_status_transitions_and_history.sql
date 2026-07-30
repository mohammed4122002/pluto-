-- Phase 2.1 continued. Split into its own migration because the new
-- appointment_status enum values added in 0014 can't be used in the same
-- transaction that added them (a hard Postgres restriction on ALTER TYPE).

create table status_transitions (
  id uuid primary key default gen_random_uuid(),
  from_status appointment_status not null,
  to_status appointment_status not null,
  allowed_roles text[] not null default '{}',
  unique (from_status, to_status)
);

create table appointment_status_history (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references appointments(id) on delete cascade,
  old_status appointment_status,
  new_status appointment_status not null,
  changed_by uuid references staff(id),
  changed_at timestamptz not null default now(),
  reason text
);

create index appointment_status_history_appt_idx on appointment_status_history (appointment_id, changed_at desc);

alter table status_transitions enable row level security;
alter table appointment_status_history enable row level security;

insert into status_transitions (from_status, to_status, allowed_roles) values
  ('draft', 'requested', '{patient,receptionist,call_center_agent,ai_booking_assistant,external_booking_channel}'),
  ('draft', 'cancelled_by_patient', '{patient,receptionist}'),

  ('requested', 'pending_review', '{receptionist,clinic_manager,branch_manager,system_administrator}'),
  ('requested', 'pending_approval', '{receptionist,clinic_manager,branch_manager,system_administrator}'),
  ('requested', 'pending_payment', '{receptionist,cashier,clinic_manager,branch_manager,system_administrator}'),
  ('requested', 'confirmed', '{receptionist,call_center_agent,clinic_manager,branch_manager,system_administrator}'),
  ('requested', 'rejected', '{receptionist,clinic_manager,branch_manager,doctor,system_administrator}'),
  ('requested', 'cancelled_by_patient', '{patient,receptionist}'),
  ('requested', 'cancelled_by_clinic', '{receptionist,clinic_manager,branch_manager,system_administrator}'),
  ('requested', 'expired', '{system_administrator,automated_notification_service}'),

  ('pending_review', 'pending_approval', '{clinic_manager,branch_manager,system_administrator}'),
  ('pending_review', 'confirmed', '{receptionist,clinic_manager,branch_manager,system_administrator}'),
  ('pending_review', 'rejected', '{clinic_manager,branch_manager,doctor,system_administrator}'),
  ('pending_review', 'cancelled_by_clinic', '{clinic_manager,branch_manager,system_administrator}'),

  ('pending_approval', 'confirmed', '{doctor,clinic_manager,branch_manager,system_administrator}'),
  ('pending_approval', 'rejected', '{doctor,clinic_manager,branch_manager,system_administrator}'),
  ('pending_approval', 'cancelled_by_clinic', '{clinic_manager,branch_manager,system_administrator}'),

  ('pending_payment', 'confirmed', '{receptionist,cashier,clinic_manager,branch_manager,system_administrator}'),
  ('pending_payment', 'expired', '{system_administrator,automated_notification_service}'),
  ('pending_payment', 'cancelled_by_patient', '{patient,receptionist}'),
  ('pending_payment', 'cancelled_by_clinic', '{receptionist,clinic_manager,branch_manager,system_administrator}'),

  ('pending_insurance_verification', 'pending_prior_authorization', '{insurance_officer,system_administrator}'),
  ('pending_insurance_verification', 'confirmed', '{insurance_officer,clinic_manager,system_administrator}'),
  ('pending_insurance_verification', 'rejected', '{insurance_officer,clinic_manager,system_administrator}'),
  ('pending_insurance_verification', 'cancelled_by_clinic', '{clinic_manager,branch_manager,system_administrator}'),

  ('pending_prior_authorization', 'confirmed', '{insurance_officer,clinic_manager,system_administrator}'),
  ('pending_prior_authorization', 'rejected', '{insurance_officer,clinic_manager,system_administrator}'),
  ('pending_prior_authorization', 'cancelled_by_clinic', '{clinic_manager,branch_manager,system_administrator}'),

  ('confirmed', 'patient_confirmed', '{patient,ai_booking_assistant,automated_notification_service}'),
  ('confirmed', 'waitlisted', '{receptionist,clinic_manager,branch_manager,system_administrator}'),
  ('confirmed', 'rescheduled', '{patient,receptionist,call_center_agent,clinic_manager,branch_manager,system_administrator}'),
  ('confirmed', 'checked_in', '{receptionist,nurse,clinic_manager,branch_manager,system_administrator}'),
  ('confirmed', 'cancelled_by_patient', '{patient,receptionist}'),
  ('confirmed', 'cancelled_by_clinic', '{receptionist,clinic_manager,branch_manager,system_administrator}'),
  ('confirmed', 'cancelled_by_doctor', '{doctor,clinic_manager,branch_manager,system_administrator}'),
  ('confirmed', 'no_show', '{receptionist,nurse,clinic_manager,branch_manager,system_administrator}'),
  ('confirmed', 'on_hold', '{receptionist,clinic_manager,branch_manager,system_administrator}'),

  ('patient_confirmed', 'checked_in', '{receptionist,nurse,clinic_manager,branch_manager,system_administrator}'),
  ('patient_confirmed', 'rescheduled', '{patient,receptionist,call_center_agent,clinic_manager,branch_manager,system_administrator}'),
  ('patient_confirmed', 'cancelled_by_patient', '{patient,receptionist}'),
  ('patient_confirmed', 'cancelled_by_clinic', '{receptionist,clinic_manager,branch_manager,system_administrator}'),
  ('patient_confirmed', 'no_show', '{receptionist,nurse,clinic_manager,branch_manager,system_administrator}'),

  ('waitlisted', 'confirmed', '{receptionist,clinic_manager,branch_manager,system_administrator}'),
  ('waitlisted', 'cancelled_by_patient', '{patient,receptionist}'),
  ('waitlisted', 'expired', '{system_administrator,automated_notification_service}'),

  ('rescheduled', 'requested', '{receptionist,call_center_agent,clinic_manager,branch_manager,system_administrator}'),
  ('rescheduled', 'confirmed', '{receptionist,call_center_agent,clinic_manager,branch_manager,system_administrator}'),

  ('checked_in', 'arrived_late', '{receptionist,nurse,clinic_manager,branch_manager,system_administrator}'),
  ('checked_in', 'waiting', '{receptionist,nurse,clinic_manager,branch_manager,system_administrator}'),
  ('checked_in', 'cancelled_by_clinic', '{receptionist,clinic_manager,branch_manager,system_administrator}'),

  ('arrived_late', 'waiting', '{receptionist,nurse,clinic_manager,branch_manager,system_administrator}'),

  ('waiting', 'called', '{nurse,doctor,clinic_manager,branch_manager,system_administrator}'),

  ('called', 'in_consultation', '{nurse,doctor,clinic_manager,branch_manager,system_administrator}'),

  ('in_consultation', 'procedure_started', '{doctor,nurse,clinic_manager,branch_manager,system_administrator}'),
  ('in_consultation', 'completed', '{doctor,nurse,clinic_manager,branch_manager,system_administrator}'),

  ('procedure_started', 'completed', '{doctor,nurse,clinic_manager,branch_manager,system_administrator}'),

  ('completed', 'checked_out', '{receptionist,cashier,nurse,clinic_manager,branch_manager,system_administrator}'),

  ('cancelled_by_doctor', 'rescheduled', '{receptionist,call_center_agent,clinic_manager,branch_manager,system_administrator}'),

  ('no_show', 'rescheduled', '{receptionist,call_center_agent,clinic_manager,branch_manager,system_administrator}'),

  ('on_hold', 'confirmed', '{receptionist,clinic_manager,branch_manager,system_administrator}'),
  ('on_hold', 'cancelled_by_clinic', '{receptionist,clinic_manager,branch_manager,system_administrator}');
