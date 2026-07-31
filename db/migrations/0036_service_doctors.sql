-- Direct service <-> doctor assignment, in addition to the broader
-- service.specialty_id / doctor_specialties link. Lets a service be
-- restricted to specific doctors (e.g. "Botox — Dr. X only") instead of
-- "any doctor with this specialty".
create table service_doctors (
  service_id uuid not null references services(id) on delete cascade,
  staff_id uuid not null references staff(id) on delete cascade,
  primary key (service_id, staff_id)
);

create index service_doctors_staff_idx on service_doctors (staff_id);

alter table service_doctors enable row level security;
