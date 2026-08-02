-- reclaim_stale_conversations (ai-services/app/routers/chat.py) needs to know
-- how long a conversation has been genuinely waiting on a staff reply since
-- escalation — it was using last_message_at for that, but last_message_at is
-- touched by every inbound patient message too (conversations.py::_touch_conversation),
-- so a patient who keeps messaging while waiting kept resetting the "stale"
-- timer and the conversation never got reclaimed back to AI.
alter table conversations
  add column escalated_at timestamptz;
