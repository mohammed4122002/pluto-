-- Channels screen redesign: per-provider credentials (encrypted), a friendly
-- display_name separate from the raw platform identifier, AI-behavior
-- settings per channel, simple keyword routing rules, and real health checks.
-- n8n_workflow_id stays on the table (the backend still needs it to manage
-- the workflow) but the API response model for staff never includes it.

alter table channels add column display_name text;
update channels set display_name = identifier where display_name is null;
alter table channels alter column display_name set not null;

alter table channels add column credentials_encrypted text;
alter table channels add column token_expires_at timestamptz;
alter table channels add column deleted_at timestamptz;

create table channel_settings (
  channel_id uuid primary key references channels(id) on delete cascade,
  ai_enabled boolean not null default true,
  ai_mode text not null default 'full_booking' check (ai_mode in ('full_booking', 'inquiry_only', 'greeting_only')),
  greeting_message text,
  outside_hours_message text,
  working_hours jsonb not null default '{}'::jsonb,
  auto_reply_outside_hours boolean not null default true,
  escalation_keywords jsonb not null default '[]'::jsonb,
  max_ai_turns_before_human integer not null default 10,
  language text not null default 'ar',
  dialect text,
  handoff_message text,
  updated_by uuid references staff(id),
  updated_at timestamptz not null default now()
);

create table channel_routing_rules (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references channels(id) on delete cascade,
  keyword text not null,
  action text not null check (action in ('assign_branch', 'escalate', 'auto_reply')),
  target_branch_id uuid references branches(id) on delete set null,
  auto_reply_text text,
  priority integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table channel_health_checks (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references channels(id) on delete cascade,
  checked_at timestamptz not null default now(),
  status text not null check (status in ('healthy', 'degraded', 'failed', 'not_connected')),
  token_valid boolean,
  webhook_registered boolean,
  last_inbound_at timestamptz,
  last_outbound_at timestamptz,
  error_code text,
  error_message text
);

create index idx_channel_health_checks_latest on channel_health_checks (channel_id, checked_at desc);

alter table channel_settings enable row level security;
alter table channel_routing_rules enable row level security;
alter table channel_health_checks enable row level security;
