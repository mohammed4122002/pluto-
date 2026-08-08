-- Cancellation/no-show fee settlement now runs as an automatic refund
-- against whatever the patient already paid, and it isn't always triggered
-- by a staff member -- the AI chatbot cancels appointments on the patient's
-- behalf with no staff present at all. processed_by has to be able to
-- record that: NULL means "settled automatically, not by a specific staff
-- member" rather than forcing a fake staff row to attribute it to.
alter table refunds alter column processed_by drop not null;
