-- Single clinic, multi-branch foundation schema.
-- Applied via Supabase MCP (mcp__supabase__apply_migration) once the project is reachable.

create extension if not exists pgcrypto;
create extension if not exists vector;

create type staff_role as enum ('admin', 'doctor', 'receptionist');
create type appointment_status as enum ('requested', 'confirmed', 'checked_in', 'completed', 'cancelled', 'no_show');

create table branches (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text,
  phone text,
  timezone text not null default 'Asia/Amman',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table staff (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email text unique not null,
  phone text,
  role staff_role not null,
  specialty text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table staff_branches (
  staff_id uuid not null references staff(id) on delete cascade,
  branch_id uuid not null references branches(id) on delete cascade,
  primary key (staff_id, branch_id)
);

create table patients (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  phone text unique not null,
  email text,
  date_of_birth date,
  gender text,
  notes text,
  created_at timestamptz not null default now()
);

create table services (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  duration_minutes int not null default 30,
  price numeric(10, 2),
  is_active boolean not null default true
);

create table branch_services (
  branch_id uuid not null references branches(id) on delete cascade,
  service_id uuid not null references services(id) on delete cascade,
  price_override numeric(10, 2),
  primary key (branch_id, service_id)
);

create table doctor_availability (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references staff(id) on delete cascade,
  branch_id uuid not null references branches(id) on delete cascade,
  day_of_week int not null check (day_of_week between 0 and 6),
  start_time time not null,
  end_time time not null,
  slot_duration_minutes int not null default 30,
  is_active boolean not null default true
);

create table appointments (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references branches(id),
  patient_id uuid not null references patients(id),
  staff_id uuid references staff(id),
  service_id uuid references services(id),
  scheduled_at timestamptz not null,
  duration_minutes int not null default 30,
  status appointment_status not null default 'requested',
  source text not null default 'dashboard',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index appointments_branch_scheduled_idx on appointments (branch_id, scheduled_at);

-- Communication channels (WhatsApp, etc.) linked per branch, wired to n8n workflows from the dashboard.
create table channels (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references branches(id) on delete cascade,
  channel_type text not null,
  identifier text not null,
  n8n_workflow_id text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table conversations (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references channels(id) on delete cascade,
  patient_id uuid references patients(id),
  status text not null default 'open',
  last_message_at timestamptz,
  created_at timestamptz not null default now()
);

create table messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  direction text not null check (direction in ('inbound', 'outbound')),
  sender_type text not null check (sender_type in ('patient', 'ai', 'staff')),
  content text not null,
  embedding vector(1536),
  created_at timestamptz not null default now()
);

create index messages_conversation_idx on messages (conversation_id, created_at);

-- RLS on by default with no policies: only the backend's service_role key (which bypasses RLS)
-- can read/write. The frontend never talks to Supabase directly, only to the backend API.
alter table branches enable row level security;
alter table staff enable row level security;
alter table staff_branches enable row level security;
alter table patients enable row level security;
alter table services enable row level security;
alter table branch_services enable row level security;
alter table doctor_availability enable row level security;
alter table appointments enable row level security;
alter table channels enable row level security;
alter table conversations enable row level security;
alter table messages enable row level security;
