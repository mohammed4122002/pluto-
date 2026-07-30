-- Phase 2.1 (FR-STS-001..006) of pluto-full-implementation-prompt.md.
-- Extends the existing appointment_status enum (additive only — the old 6
-- values, including the generic 'cancelled', stay so existing code keeps
-- working) and adds the transition graph + audit history.
--
-- Per the doc: insurance-linked statuses exist in the enum for completeness
-- but their workflow logic is deferred (client explicitly postponed it).

alter type appointment_status add value if not exists 'draft';
alter type appointment_status add value if not exists 'pending_review';
alter type appointment_status add value if not exists 'pending_approval';
alter type appointment_status add value if not exists 'pending_payment';
alter type appointment_status add value if not exists 'pending_insurance_verification';
alter type appointment_status add value if not exists 'pending_prior_authorization';
alter type appointment_status add value if not exists 'patient_confirmed';
alter type appointment_status add value if not exists 'waitlisted';
alter type appointment_status add value if not exists 'rescheduled';
alter type appointment_status add value if not exists 'arrived_late';
alter type appointment_status add value if not exists 'waiting';
alter type appointment_status add value if not exists 'called';
alter type appointment_status add value if not exists 'in_consultation';
alter type appointment_status add value if not exists 'procedure_started';
alter type appointment_status add value if not exists 'checked_out';
alter type appointment_status add value if not exists 'cancelled_by_patient';
alter type appointment_status add value if not exists 'cancelled_by_clinic';
alter type appointment_status add value if not exists 'cancelled_by_doctor';
alter type appointment_status add value if not exists 'rejected';
alter type appointment_status add value if not exists 'expired';
alter type appointment_status add value if not exists 'on_hold';
