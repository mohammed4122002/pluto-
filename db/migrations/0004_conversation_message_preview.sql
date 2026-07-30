-- Denormalized so the inbox list can render without an N+1 query per
-- conversation to fetch its latest message.
alter table conversations
  add column last_message_preview text,
  add column last_sender text;
