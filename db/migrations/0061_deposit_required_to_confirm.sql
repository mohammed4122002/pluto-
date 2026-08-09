-- Optional gate: hold a booking at 'pending_payment' until the deposit is
-- verified, instead of confirming it the moment it is made. Clinics that
-- lose money to no-shows want the commitment up front; clinics that don't
-- would find it friction, so it is off by default and nothing changes for
-- them.
--
-- The status machine already models this exactly (requested ->
-- pending_payment -> confirmed), so this adds no new states -- only the
-- switch that decides which path a new booking takes.
alter table clinic_settings
  add column require_deposit_to_confirm boolean not null default false,
  add column default_deposit_amount numeric check (default_deposit_amount is null or default_deposit_amount > 0);

comment on column clinic_settings.default_deposit_amount is
  'Clinic-wide deposit. services.deposit_amount overrides it per service.';
