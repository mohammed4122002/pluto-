-- Replace the single clinic-wide staff bot with a per-staff bot: every
-- staff member creates and links their own Telegram bot from their own
-- dashboard page, no admin bottleneck. The old link-code flow is replaced
-- by direct linking through the per-staff webhook (the URL itself already
-- identifies which staff/bot a message belongs to).
alter table clinic_settings drop column staff_bot_token_encrypted;
alter table clinic_settings drop column staff_bot_username;
alter table clinic_settings drop column staff_bot_webhook_secret;

alter table staff drop column telegram_link_code;
alter table staff drop column telegram_link_code_expires_at;

alter table staff add column telegram_bot_token_encrypted text;
alter table staff add column telegram_bot_username text;
alter table staff add column telegram_bot_webhook_secret text;
