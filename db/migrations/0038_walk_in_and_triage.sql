-- FR-WIN-001..007: walk-in patients and nurse triage.
-- is_walk_in distinguishes a walk-in ticket from a normally scheduled
-- check-in in reporting/queue views; the triage_* columns let a nurse record
-- an assessment against the ticket before the doctor sees the patient.
alter table queue_tickets add column if not exists is_walk_in boolean not null default false;
alter table queue_tickets add column if not exists triage_level text check (triage_level in ('non_urgent', 'urgent', 'emergency'));
alter table queue_tickets add column if not exists triage_notes text;
alter table queue_tickets add column if not exists triaged_by uuid references staff(id);
alter table queue_tickets add column if not exists triaged_at timestamptz;
