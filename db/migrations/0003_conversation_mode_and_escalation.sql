-- Human/AI handoff: a conversation is either AI-handled or has been escalated
-- to a staff member. needs_attention drives the inbox's "needs follow-up" filter.
alter table conversations
  add column mode text not null default 'ai' check (mode in ('ai', 'human')),
  add column needs_attention boolean not null default false,
  add column assigned_staff_id uuid references staff(id);

-- Lets a channel's workflow be triggered from the backend when staff reply
-- manually from the dashboard (not just AI-generated replies).
alter table channels
  add column outbound_webhook_url text;

create index conversations_needs_attention_idx on conversations (needs_attention) where needs_attention;
