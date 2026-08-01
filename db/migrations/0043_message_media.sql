-- Receipt-image capture in chat: a patient sending a photo of their payment
-- receipt needs to be stored as a real message attachment, not silently
-- dropped (messages.content was text-only until now).
alter table messages add column if not exists media_url text;
alter table messages add column if not exists media_type text check (media_type in ('image', 'document', 'audio', 'video'));
