-- Phase 4.2 — manual payment/receipt module (both prompt docs agree on this
-- scope: no payment gateway integration, just manual cash/bank-transfer
-- receipt review, since that's the clinic's real workflow today).

create table payment_methods (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid references branches(id) on delete cascade,
  method_type text not null check (method_type in ('mobile_cash', 'bank_transfer', 'cash', 'other')),
  display_name text not null,
  account_number text,
  is_active boolean not null default true
);

create table payments (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references appointments(id) on delete cascade,
  patient_id uuid not null references patients(id) on delete cascade,
  amount numeric not null,
  currency text,
  method text check (method in ('mobile_cash', 'bank_transfer', 'cash', 'other')),
  payment_instructions_sent_at timestamptz,
  status text not null default 'pending' check (status in ('pending', 'receipt_submitted', 'verified', 'rejected')),
  receipt_image_url text,
  submitted_at timestamptz,
  verified_by uuid references staff(id),
  verified_at timestamptz,
  rejection_reason text,
  notes text,
  created_at timestamptz not null default now()
);

create index payments_appointment_idx on payments (appointment_id);
create index payments_status_idx on payments (status);

alter table payment_methods enable row level security;
alter table payments enable row level security;
