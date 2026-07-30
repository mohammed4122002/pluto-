-- Omnichannel identity layer (PLUTO-COMPLETION-PROMPT.md section 1.1): a
-- channel account (WhatsApp number, Telegram chat_id, Instagram-scoped user
-- id, anonymous web visitor) is not the same thing as a patient record.
-- conversations keep linking through patient_id for now (unchanged, lower
-- risk for the existing codebase) — this table is the new source of truth
-- for "who is this on this specific channel", with patient_id resolved
-- through it rather than through synthetic phone values like 'tg:12345'.

create table patient_channel_identities (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references channels(id) on delete cascade,
  provider_type text not null check (provider_type in ('whatsapp', 'telegram', 'instagram', 'messenger', 'web', 'sms')),
  external_user_id text not null,
  display_name text,
  phone_number text,
  patient_id uuid references patients(id) on delete set null,
  verified_at timestamptz,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (channel_id, external_user_id)
);

create index idx_patient_channel_identities_patient on patient_channel_identities (patient_id);

alter table conversations add column patient_channel_identity_id uuid references patient_channel_identities(id) on delete set null;

-- Anonymous web-chat sessions (no identity yet, may never resolve to one).
create table anonymous_sessions (
  id uuid primary key default gen_random_uuid(),
  session_token text not null unique,
  channel_id uuid not null references channels(id) on delete cascade,
  ip_address text,
  user_agent text,
  started_at timestamptz not null default now(),
  expires_at timestamptz not null,
  linked_identity_id uuid references patient_channel_identities(id) on delete set null
);

-- Per-provider messaging constraints (session windows, template requirements)
-- — schema now, populated as each channel is actually implemented.
create table channel_capabilities (
  provider_type text primary key,
  supports_proactive boolean not null default true,
  session_window_hours integer,
  requires_approved_template boolean not null default false,
  supports_media boolean not null default true,
  supports_buttons boolean not null default false,
  max_text_length integer,
  supports_rtl boolean not null default true
);

insert into channel_capabilities (provider_type, supports_proactive, session_window_hours, requires_approved_template, supports_media, supports_buttons, max_text_length, supports_rtl) values
  ('telegram', true, null, false, true, true, null, true),
  ('sms', true, null, false, false, false, 70, true),
  ('whatsapp', false, 24, true, true, true, null, true),
  ('messenger', false, 24, false, true, true, null, true),
  ('instagram', false, 168, false, true, false, null, true),
  ('web', true, null, false, true, true, null, true);

alter table patient_channel_identities enable row level security;
alter table anonymous_sessions enable row level security;
alter table channel_capabilities enable row level security;
