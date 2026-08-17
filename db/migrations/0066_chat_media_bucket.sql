-- chat-media (Supabase Storage) is where n8n uploads a patient's inbound
-- photos and voice notes before /conversations/inbound and ai-services ever
-- see them (payment receipts, symptom photos, voice-note audio) -- see
-- 0043_message_media.sql for the messages.media_url/media_type columns
-- this feeds. The bucket itself was never created by a migration: it
-- existed only on the live project, created by hand at some point outside
-- this repo, and its allowed_mime_types was image-only -- which meant every
-- clinic deploying this template from scratch needed someone to remember
-- to create and configure it manually, and even the live project's own
-- voice-note upload failed outright with invalid_mime_type once the
-- voice-note feature started sending audio/ogg (confirmed live: a patient's
-- voice note got no reply at all -- n8n's upload to Storage rejected it
-- before the message ever reached the database).
--
-- Idempotent upsert: creates the bucket for a fresh clinic, and widens an
-- already-existing bucket's allowed_mime_types without dropping whatever
-- else was already permitted.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'chat-media',
  'chat-media',
  true,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'audio/ogg', 'audio/mpeg', 'audio/mp4', 'audio/webm']
)
on conflict (id) do update
set allowed_mime_types = (
  select array(
    select distinct unnest(
      storage.buckets.allowed_mime_types
      || excluded.allowed_mime_types
    )
  )
);
