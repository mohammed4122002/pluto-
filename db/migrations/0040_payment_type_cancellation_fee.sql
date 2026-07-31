-- _charge_fee (backend) and the AI cancellation path both insert a payments
-- row for a cancellation fee but had no payment_type value to mark it as
-- such, so it silently defaulted to 'full' — indistinguishable from real
-- revenue in any report grouped by payment_type (RPT-024/025/027).
alter table payments drop constraint if exists payments_payment_type_check;
alter table payments add constraint payments_payment_type_check
  check (payment_type in ('deposit', 'full', 'balance', 'package', 'cancellation_fee'));
