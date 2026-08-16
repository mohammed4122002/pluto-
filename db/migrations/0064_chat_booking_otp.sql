-- A one-time code the AI sends in-chat right before book_appointment runs,
-- once branch/service/doctor/time are all decided -- a deliberate "yes,
-- confirm this" moment, not a durable auth credential. Ephemeral by design:
-- a fresh code replaces any earlier unconsumed one for the same
-- conversation, so a patient who asks for a resend is never confused by an
-- old code that still works, and ai-services' book_appointment gate checks
-- that the most recent code was verified recently (see
-- app/services/otp.py::has_verified_booking_otp), not just ever.
create table if not exists chat_booking_otp (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  code text not null,
  attempts int not null default 0,
  consumed_at timestamptz,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists chat_booking_otp_conversation_idx on chat_booking_otp(conversation_id, created_at desc);

comment on table chat_booking_otp is
  'One-time codes sent in-chat to confirm a booking right before book_appointment runs. Ephemeral: a fresh code is generated per confirmation attempt, and only the most recently generated one for a conversation is ever valid.';

alter table chat_booking_otp enable row level security;
