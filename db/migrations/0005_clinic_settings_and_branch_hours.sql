-- Singleton table: general clinic info the AI assistant is grounded in
-- (name, policies/insurance/payment notes) alongside the real branches/
-- services data it already queries.
create table clinic_settings (
  id uuid primary key default gen_random_uuid(),
  clinic_name text not null default '',
  about_text text not null default '',
  updated_at timestamptz not null default now()
);

insert into clinic_settings (clinic_name, about_text) values ('', '');

alter table branches add column working_hours_note text;

alter table clinic_settings enable row level security;
