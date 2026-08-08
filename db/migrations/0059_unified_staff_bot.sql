-- Move the staff Telegram bot back to a single clinic-wide bot: one
-- BotFather token, configured once by an admin, instead of every staff
-- member needing to create their own bot via BotFather -- a bar that turned
-- out to be too technical for non-technical staff in practice (confirmed:
-- two active escalation-pool members sat unlinked for weeks). Staff still
-- link individually and without admin involvement per-person -- each
-- generates a one-time code from their own account page and sends it to the
-- shared bot -- so who receives which alert doesn't change, only who has to
-- ever touch BotFather (now: nobody, except once at initial setup).
alter table clinic_settings add column staff_bot_token_encrypted text;
alter table clinic_settings add column staff_bot_username text;
alter table clinic_settings add column staff_bot_webhook_secret text;

alter table staff add column telegram_link_code text;
alter table staff add column telegram_link_code_expires_at timestamptz;

alter table staff drop column telegram_bot_token_encrypted;
alter table staff drop column telegram_bot_username;
alter table staff drop column telegram_bot_webhook_secret;

-- Any chat_id on file was paired with a staff member's now-defunct personal
-- bot, not the new shared one -- stale, not just unused, so it has to go
-- rather than linger and read as "already linked" when it no longer is.
update staff set telegram_chat_id = null where telegram_chat_id is not null;
