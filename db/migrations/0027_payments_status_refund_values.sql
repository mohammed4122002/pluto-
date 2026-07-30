-- The refund flow (Phase D) needs 'refunded'/'partially_refunded' as valid
-- payments.status values, but the original check constraint from
-- 0019_payments.sql only allowed the manual-receipt-review states.
alter table payments drop constraint payments_status_check;
alter table payments add constraint payments_status_check
  check (status in ('pending', 'receipt_submitted', 'verified', 'rejected', 'refunded', 'partially_refunded'));
