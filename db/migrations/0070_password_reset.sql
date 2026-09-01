-- Self-service password reset. There is no email infrastructure in this
-- codebase (every notification path is a chat channel, not SMTP), so the
-- reset link is delivered the same way escalation alerts already are: the
-- clinic's shared staff Telegram bot, to whatever chat_id the requesting
-- staff member has linked. A staff member who never linked Telegram still
-- gets the same generic "check your Telegram" response (no enumeration
-- signal either way) but has nothing delivered -- an admin has to reset
-- them via /staff/{id}/set-password (see staff.py) instead.
alter table staff add column password_reset_token_hash text;
alter table staff add column password_reset_expires_at timestamptz;
