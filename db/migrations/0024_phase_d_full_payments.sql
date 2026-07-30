-- Phase D (starting with full payments): packages, coupons, refunds, invoices.

alter table payments add column payment_type text not null default 'full'
  check (payment_type in ('deposit', 'full', 'balance', 'package'));
alter table payments add column transaction_reference text;

create table packages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  service_id uuid references services(id) on delete cascade,
  sessions_count integer not null check (sessions_count > 0),
  price numeric not null,
  validity_days integer not null default 365,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table patient_packages (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients(id) on delete cascade,
  package_id uuid not null references packages(id) on delete cascade,
  sessions_remaining integer not null,
  status text not null default 'pending_payment' check (status in ('pending_payment', 'active', 'cancelled', 'expired')),
  purchased_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index idx_patient_packages_patient on patient_packages (patient_id, status);

alter table payments add column patient_package_id uuid references patient_packages(id) on delete set null;

create table coupons (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  discount_type text not null check (discount_type in ('fixed', 'percentage')),
  discount_value numeric not null check (discount_value > 0),
  valid_from timestamptz,
  valid_to timestamptz,
  max_uses integer,
  used_count integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table payments add column coupon_id uuid references coupons(id) on delete set null;

create table refunds (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references payments(id) on delete cascade,
  amount numeric not null check (amount > 0),
  reason text not null,
  processed_by uuid not null references staff(id),
  processed_at timestamptz not null default now()
);

create table invoices (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid references appointments(id) on delete cascade,
  patient_id uuid not null references patients(id) on delete cascade,
  invoice_number text not null unique,
  subtotal numeric not null,
  discount numeric not null default 0,
  total numeric not null,
  issued_at timestamptz not null default now(),
  issued_by uuid references staff(id)
);

alter table packages enable row level security;
alter table patient_packages enable row level security;
alter table coupons enable row level security;
alter table refunds enable row level security;
alter table invoices enable row level security;

insert into permissions (resource, action, code, description) values
  ('package', 'view', 'package.view', null),
  ('package', 'manage', 'package.manage', 'define packages and sell them to patients'),
  ('coupon', 'view', 'coupon.view', null),
  ('coupon', 'manage', 'coupon.manage', 'create/deactivate coupons'),
  ('invoice', 'view', 'invoice.view', null),
  ('invoice', 'manage', 'invoice.manage', 'issue invoices');

insert into role_permissions (role_id, permission_id)
select r.id, p.id from (values
  ('cashier', 'package.view'), ('cashier', 'package.manage'),
  ('cashier', 'coupon.view'),
  ('cashier', 'invoice.view'), ('cashier', 'invoice.manage'),
  ('receptionist', 'package.view'),
  ('receptionist', 'invoice.view'),
  ('branch_manager', 'package.view'), ('branch_manager', 'package.manage'),
  ('branch_manager', 'coupon.view'), ('branch_manager', 'coupon.manage'),
  ('branch_manager', 'invoice.view'), ('branch_manager', 'invoice.manage')
) as grants(role_code, permission_code)
join roles r on r.code = grants.role_code
join permissions p on p.code = grants.permission_code;

insert into role_permissions (role_id, permission_id)
select r.id, p.id from roles r
cross join permissions p
where r.code in ('clinic_manager', 'system_administrator')
  and p.code in ('package.view', 'package.manage', 'coupon.view', 'coupon.manage', 'invoice.view', 'invoice.manage');
