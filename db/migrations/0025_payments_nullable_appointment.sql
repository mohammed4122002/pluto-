-- Package purchases (Phase D) create a payments row that isn't tied to any
-- specific appointment — the patient is buying a multi-session package, not
-- booking a single visit. Relax the NOT NULL so payments.patient_package_id
-- can stand in for appointment_id on that path.
alter table payments alter column appointment_id drop not null;
