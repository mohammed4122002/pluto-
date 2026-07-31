-- FR-RCL-001..007: doctor/patient follow-up recalls.
create table recalls (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients(id) on delete cascade,
  branch_id uuid not null references branches(id) on delete cascade,
  doctor_id uuid references staff(id) on delete set null,
  service_id uuid references services(id) on delete set null,
  source_appointment_id uuid references appointments(id) on delete set null,
  due_date date not null,
  reason_type text not null check (
    reason_type in ('specific_date', 'after_days', 'medical_result', 'treatment_plan', 'vaccination', 'periodic_checkup')
  ),
  reason_notes text,
  status text not null default 'pending' check (status in ('pending', 'invited', 'responded', 'booked', 'escalated', 'cancelled')),
  invited_at timestamptz,
  responded_at timestamptz,
  escalated_at timestamptz,
  resulting_appointment_id uuid references appointments(id) on delete set null,
  created_by uuid references staff(id),
  created_at timestamptz not null default now()
);

create index idx_recalls_due on recalls (status, due_date);
create index idx_recalls_patient on recalls (patient_id);
create index idx_recalls_branch on recalls (branch_id);
create index idx_recalls_doctor on recalls (doctor_id);
create index idx_recalls_service on recalls (service_id);
create index idx_recalls_source_appointment on recalls (source_appointment_id);
create index idx_recalls_resulting_appointment on recalls (resulting_appointment_id);
create index idx_recalls_created_by on recalls (created_by);

alter table recalls enable row level security;

-- FR-RCL-002: services that should automatically open a follow-up recall
-- this many days after a completed visit. Null (the default) means no
-- automatic recall for that service.
alter table services add column if not exists default_recall_after_days int;

insert into notification_templates (code, channel_type, language, body_template)
values ('recall_invitation', 'whatsapp', 'ar', 'مرحباً {{patient_name}}، حان وقت متابعتك الدورية بعيادتنا. يرجى التواصل معنا لحجز موعد.')
on conflict (code) do nothing;

insert into permissions (resource, action, code, description) values
  ('recall', 'manage', 'recall.manage', 'إنشاء ومتابعة الاستدعاءات (Recall)')
on conflict (code) do nothing;

insert into role_permissions (role_id, permission_id)
select r.id, p.id from roles r, permissions p
where r.code in ('doctor', 'branch_manager', 'call_center_agent', 'receptionist')
  and p.code = 'recall.manage'
on conflict do nothing;
