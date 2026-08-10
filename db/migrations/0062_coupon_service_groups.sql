-- A coupon could only be scoped to one service (coupons.service_id) or to
-- every service. A clinic wants the middle case too: one code covering a group
-- of services, e.g. all the dental ones.
create table if not exists coupon_services (
  coupon_id uuid not null references coupons(id) on delete cascade,
  service_id uuid not null references services(id) on delete cascade,
  primary key (coupon_id, service_id)
);

create index if not exists coupon_services_service_idx on coupon_services(service_id);

-- Carry the existing single-service scoping over, so nothing changes meaning:
-- a coupon with one row here behaves exactly as service_id did.
insert into coupon_services (coupon_id, service_id)
select id, service_id from coupons where service_id is not null
on conflict do nothing;

comment on table coupon_services is
  'Services a coupon is limited to. No rows means the coupon applies to every service. Supersedes coupons.service_id, which is kept only so an older deploy reading it does not break.';

-- Every other table in this schema has RLS enabled with no policies: the API
-- reaches the database through the service key, and PostgREST is meant to be
-- denied outright. Without this the table is readable and writable directly
-- through the public API. (Applied separately as 0063.)
alter table coupon_services enable row level security;
