-- Lets each channel configure how long a conversation can sit escalated to a
-- human with no staff reply before the AI reclaims it and answers the
-- backlog of messages that piled up while it was silent (see
-- ai-services/app/routers/chat.py::reclaim_stale_conversations).
alter table channel_settings
  add column human_handoff_timeout_minutes integer not null default 20;

-- Speeds up the periodic scan for conversations stuck in human mode that a
-- staff member never answered.
create index conversations_stale_handoff_idx
  on conversations (last_message_at)
  where mode = 'human' and needs_attention;
