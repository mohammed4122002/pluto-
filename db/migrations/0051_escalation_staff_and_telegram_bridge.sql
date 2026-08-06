-- Which staff are on escalation duty per branch (null branch_id = all
-- branches' pool). Auto-assignment picks whoever in this pool currently
-- has the fewest open assigned conversations.
create table escalation_staff (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references staff(id) on delete cascade,
  branch_id uuid references branches(id) on delete cascade,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (staff_id, branch_id)
);
create index idx_escalation_staff_branch on escalation_staff (branch_id, is_active);

-- A staff member's own Telegram chat, linked via a one-time code they send
-- to the internal staff bot. Separate from patient_channel_identities --
-- staff are never patients.
alter table staff add column telegram_chat_id text;
alter table staff add column telegram_link_code text;
alter table staff add column telegram_link_code_expires_at timestamptz;
create unique index idx_staff_telegram_chat_id on staff (telegram_chat_id) where telegram_chat_id is not null;

-- Maps a sent Telegram alert message back to the conversation it's about,
-- so when the staff member replies (Telegram's native "reply to" on that
-- exact message), the bot knows which patient conversation the reply is
-- for -- without this, a staff member handling two escalations at once
-- would have no way to say which one a plain reply belongs to.
create table staff_escalation_alerts (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  staff_id uuid not null references staff(id) on delete cascade,
  telegram_message_id bigint not null,
  created_at timestamptz not null default now(),
  unique (staff_id, telegram_message_id)
);
create index idx_staff_escalation_alerts_conversation on staff_escalation_alerts (conversation_id);

alter table escalation_staff enable row level security;
alter table staff_escalation_alerts enable row level security;
