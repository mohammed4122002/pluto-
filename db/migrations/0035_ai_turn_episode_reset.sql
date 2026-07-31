-- A conversation stays open indefinitely (handle_inbound_message reuses the
-- same open row across days), so counting "AI turns" over the row's whole
-- lifetime made max_ai_turns_before_human trip permanently on any
-- long-lived thread regardless of how the current round is going. Track
-- when the AI last took over so the count is scoped to the current episode
-- (resets whenever a human hand-off is reclaimed or a staff member manually
-- switches the conversation back to AI), not the conversation's entire history.
alter table conversations
  add column ai_episode_started_at timestamptz not null default now();
