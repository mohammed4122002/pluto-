-- Cancelling (or no-showing) an appointment used to leave its still-pending
-- deposit/receipt-review payment row exactly as it was: forever 'pending',
-- with no way to tell it apart from a live payment request. Confirmed live:
-- a chat-driven cancellation before the deposit was ever paid left a 10 JOD
-- "pending" payment attached to a cancelled appointment, which both
-- misrepresents any pending-payments report and stays eligible to be
-- matched by find_pending_receipt_payment (ai-services) /
-- attach_receipt_from_inbound_media (backend) against a future, unrelated
-- photo from the same patient. 'cancelled' lets settle_appointment_fee
-- (backend) and _settle_cancellation_fee (ai-services) void that row
-- explicitly instead of leaving it stuck in 'pending'/'receipt_submitted'.
alter table payments drop constraint payments_status_check;
alter table payments add constraint payments_status_check
  check (status in ('pending', 'receipt_submitted', 'verified', 'rejected', 'refunded', 'partially_refunded', 'cancelled'));
