-- Packages: support a bundle of several services instead of a single service_id.
create table package_services (
  package_id uuid not null references packages(id) on delete cascade,
  service_id uuid not null references services(id) on delete cascade,
  primary key (package_id, service_id)
);
create index idx_package_services_service on package_services (service_id);

insert into package_services (package_id, service_id)
select id, service_id from packages where service_id is not null;

alter table packages drop column service_id;

-- Appointments: which patient_package (if any) this visit is billed against,
-- decided at booking time -- deducting a session on completion then just
-- means "was this appointment ever linked to a package", not guessing from
-- a service-name match after the fact (a patient can have an active package
-- for a service and still separately pay full price for one visit).
alter table appointments add column patient_package_id uuid references patient_packages(id) on delete set null;
create index idx_appointments_patient_package on appointments (patient_package_id);

-- Coupons: richer discount types + targeting + per-customer enforcement.
alter table coupons drop constraint coupons_discount_type_check;
alter table coupons add constraint coupons_discount_type_check
  check (discount_type in ('fixed', 'percentage', 'free_session', 'free_consultation', 'service_upgrade'));

alter table coupons alter column discount_value drop not null;
alter table coupons drop constraint coupons_discount_value_check;
alter table coupons add constraint coupons_discount_value_check
  check (
    (discount_type in ('fixed', 'percentage') and discount_value is not null and discount_value > 0
      and (discount_type <> 'percentage' or discount_value <= 100))
    or (discount_type in ('free_session', 'free_consultation', 'service_upgrade'))
  );

alter table coupons add column branch_id uuid references branches(id) on delete cascade;
alter table coupons add column service_id uuid references services(id) on delete cascade;
alter table coupons add column customer_scope text not null default 'all' check (customer_scope in ('all', 'new', 'existing'));
alter table coupons add column per_customer_limit integer check (per_customer_limit is null or per_customer_limit > 0);

create index idx_coupons_branch on coupons (branch_id);
create index idx_coupons_service on coupons (service_id);

-- Tracks who redeemed what, so per_customer_limit / single-use-per-customer
-- is actually enforceable instead of just a global used_count.
create table coupon_redemptions (
  id uuid primary key default gen_random_uuid(),
  coupon_id uuid not null references coupons(id) on delete cascade,
  patient_id uuid not null references patients(id) on delete cascade,
  payment_id uuid references payments(id) on delete set null,
  redeemed_at timestamptz not null default now()
);
create index idx_coupon_redemptions_coupon_patient on coupon_redemptions (coupon_id, patient_id);

alter table package_services enable row level security;
alter table coupon_redemptions enable row level security;
