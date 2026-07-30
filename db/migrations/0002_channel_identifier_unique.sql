-- A WhatsApp/Telegram identifier must resolve to exactly one channel, or
-- inbound routing (GET /channels?identifier=) becomes ambiguous.
alter table channels add constraint channels_identifier_unique unique (identifier);
