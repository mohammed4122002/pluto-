-- Replace the n8n-webhook-mediated design (never went live) with a
-- self-contained one: the clinic pastes a bot token straight into the
-- dashboard, and the backend talks to Telegram's Bot API directly --
-- both to send alerts and to receive replies via a registered webhook.
alter table clinic_settings drop column staff_bot_webhook_url;
alter table clinic_settings drop column staff_bot_identifier;
alter table clinic_settings add column staff_bot_token_encrypted text;
alter table clinic_settings add column staff_bot_username text;
alter table clinic_settings add column staff_bot_webhook_secret text;
