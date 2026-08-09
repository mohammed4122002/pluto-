-- Route an escalation to someone who can actually resolve it: a clinical
-- question needs a doctor, a refund dispute needs reception. Until now every
-- escalation went to whoever in the pool was least busy, so a patient asking
-- "is this dangerous?" could land on a receptionist who cannot answer it, and
-- a billing dispute could land on a doctor mid-clinic.
--
-- Nullable on purpose. NULL means "handles anything", which is both the old
-- behaviour and a sane default -- routing falls back to inferring from the
-- staff member's role (doctor -> medical, everyone else -> administrative),
-- so this works with zero configuration and the column only exists for the
-- cases where the role is the wrong answer.
alter table escalation_staff
  add column handles text
  check (handles is null or handles in ('medical', 'administrative'));

comment on column escalation_staff.handles is
  'Which escalation categories this pool member takes. NULL = infer from staff.role.';
