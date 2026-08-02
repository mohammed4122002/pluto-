-- issue_invoice() now checks for an existing invoice before inserting, but
-- that check-then-insert has a race: two near-simultaneous "إصدار فاتورة"
-- clicks (double-click, or two staff members on the same appointment) could
-- both pass the check before either insert lands, producing two invoices
-- for one appointment_id — confirmed reachable in production, not
-- theoretical (audit found two live invoices, INV-...-EB2D9D and
-- INV-...-0DBA95, for the same appointment). The unique index is what
-- actually closes it; the application check just avoids paying the round
-- trip to find that out.
create unique index if not exists idx_invoices_one_per_appointment
  on public.invoices (appointment_id);
