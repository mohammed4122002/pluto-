-- Every conversation's branch has always come from its channel
-- (channels.branch_id, not null -- one WhatsApp/Telegram number per branch).
-- A clinic with more than one branch sharing a single number needs the
-- patient to actually choose one in chat instead, so this column overrides
-- the channel's default for that one conversation once they do (see
-- ai-services' select_branch tool and _load_conversation, which now prefers
-- this over channels.branch_id when set). Left null, nothing changes: a
-- single-branch clinic (most of them) never touches this column at all.
alter table conversations add column if not exists branch_id uuid references branches(id);

comment on column conversations.branch_id is
  'Overrides the channel''s default branch for this one conversation, once the patient picks a branch in chat (multi-branch clinics sharing one channel only). Null means "use the channel''s branch", which is every conversation before this existed.';
