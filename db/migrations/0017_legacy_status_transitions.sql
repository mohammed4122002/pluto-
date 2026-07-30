-- The existing dashboard (AppointmentsPage.tsx) offers a free-form dropdown
-- that lets staff jump directly between any of the original 6 statuses
-- (requested/confirmed/checked_in/completed/cancelled/no_show) with no
-- guided flow. Backfilling full any-to-any coverage for exactly those 6
-- preserves that behavior with zero regression, while still letting the
-- status-update endpoint route through the new validated transition +
-- history logging (FR-AUD-001) instead of a bare unchecked UPDATE.

insert into status_transitions (from_status, to_status, allowed_roles)
select a.from_status, b.to_status, '{receptionist,doctor,nurse,clinic_manager,branch_manager,system_administrator}'
from (values
  ('requested'::appointment_status), ('confirmed'::appointment_status), ('checked_in'::appointment_status),
  ('completed'::appointment_status), ('cancelled'::appointment_status), ('no_show'::appointment_status)
) as a(from_status)
cross join (values
  ('requested'::appointment_status), ('confirmed'::appointment_status), ('checked_in'::appointment_status),
  ('completed'::appointment_status), ('cancelled'::appointment_status), ('no_show'::appointment_status)
) as b(to_status)
where a.from_status <> b.to_status
on conflict (from_status, to_status) do nothing;
