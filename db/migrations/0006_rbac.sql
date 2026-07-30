-- RBAC data model (Phase 0 of pluto-full-implementation-prompt.md).
-- Model only in this migration: roles/permissions/role_permissions/user_roles
-- are populated with sensible defaults, but no endpoint enforces them yet —
-- PLUTO has no login/session system to identify "who is calling" a request.
-- Enforcement gets wired in once an auth layer exists.

create table roles (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name_ar text not null,
  name_en text not null,
  description text,
  is_system boolean not null default true,
  created_at timestamptz not null default now()
);

create table permissions (
  id uuid primary key default gen_random_uuid(),
  resource text not null,
  action text not null,
  code text not null unique,
  description text,
  created_at timestamptz not null default now()
);

create table role_permissions (
  role_id uuid not null references roles(id) on delete cascade,
  permission_id uuid not null references permissions(id) on delete cascade,
  primary key (role_id, permission_id)
);

-- branch_id null = organization-wide grant. Finer scopes from FR-SEC-002
-- (department/doctor-self) layer on later once those entities exist.
create table user_roles (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid references staff(id) on delete cascade,
  role_id uuid not null references roles(id) on delete cascade,
  branch_id uuid references branches(id) on delete cascade,
  granted_by uuid references staff(id),
  granted_at timestamptz not null default now(),
  unique (staff_id, role_id, branch_id)
);

create index user_roles_staff_id_idx on user_roles (staff_id);

-- 15 actors from FR-SEC-001..010.
insert into roles (code, name_ar, name_en, description) values
  ('patient', 'مريض', 'Patient', 'يتواصل عبر القنوات/المساعد الذكي، لا وصول للداشبورد'),
  ('receptionist', 'موظف استقبال', 'Receptionist', 'يدير الحجوزات والمرضى، مقيّد بفرعه'),
  ('call_center_agent', 'موظف مركز اتصال', 'Call Center Agent', 'يحجز ويعدّل مواعيد عبر الهاتف'),
  ('doctor', 'طبيب', 'Doctor', 'يشاهد جدوله ومرضاه فقط'),
  ('nurse', 'ممرض/ة', 'Nurse', 'يدعم سير العمل السريري: check-in/check-out'),
  ('clinic_manager', 'مدير العيادة', 'Clinic Manager', 'صلاحية كاملة على كل الفروع'),
  ('branch_manager', 'مدير فرع', 'Branch Manager', 'صلاحية كاملة مقيّدة بفرعه'),
  ('system_administrator', 'مدير نظام', 'System Administrator', 'صلاحية تقنية كاملة'),
  ('insurance_officer', 'موظف تأمين', 'Insurance Officer', 'مراجعة واعتماد مطالبات التأمين'),
  ('cashier', 'أمين صندوق', 'Cashier', 'يدير المدفوعات عند نقطة الخدمة'),
  ('telemedicine_coordinator', 'منسّق تطبيب عن بعد', 'Telemedicine Coordinator', 'ينسّق مواعيد الاستشارة عن بعد'),
  ('external_booking_channel', 'قناة حجز خارجية', 'External Booking Channel', 'حجوزات واردة من قناة خارجية (n8n/واتساب/تيليجرام)'),
  ('api_integration_user', 'مستخدم تكامل API', 'API Integration User', 'وصول برمجي عام عبر الـ API'),
  ('automated_notification_service', 'خدمة إشعارات آلية', 'Automated Notification Service', 'قراءة فقط لإرسال التذكيرات'),
  ('ai_booking_assistant', 'مساعد الحجز الذكي', 'AI Booking Assistant', 'الحجز والرد الآلي عبر AI Service');

insert into permissions (resource, action, code, description) values
  ('appointment', 'view', 'appointment.view', null),
  ('appointment', 'create', 'appointment.create', null),
  ('appointment', 'update', 'appointment.update', null),
  ('appointment', 'cancel', 'appointment.cancel', null),
  ('appointment', 'reschedule', 'appointment.reschedule', null),
  ('appointment', 'check_in', 'appointment.check_in', null),
  ('appointment', 'check_out', 'appointment.check_out', null),
  ('appointment', 'override', 'appointment.override', null),
  ('appointment', 'delete', 'appointment.delete', null),
  ('appointment', 'approve', 'appointment.approve', null),
  ('appointment', 'export', 'appointment.export', null),
  ('patient', 'view', 'patient.view', null),
  ('patient', 'create', 'patient.create', null),
  ('patient', 'update', 'patient.update', null),
  ('patient', 'delete', 'patient.delete', null),
  ('patient', 'export', 'patient.export', null),
  ('staff', 'view', 'staff.view', null),
  ('staff', 'create', 'staff.create', null),
  ('staff', 'update', 'staff.update', null),
  ('staff', 'delete', 'staff.delete', null),
  ('branch', 'view', 'branch.view', null),
  ('branch', 'create', 'branch.create', null),
  ('branch', 'update', 'branch.update', null),
  ('branch', 'delete', 'branch.delete', null),
  ('service', 'view', 'service.view', null),
  ('service', 'create', 'service.create', null),
  ('service', 'update', 'service.update', null),
  ('service', 'delete', 'service.delete', null),
  ('channel', 'view', 'channel.view', null),
  ('channel', 'create', 'channel.create', null),
  ('channel', 'update', 'channel.update', null),
  ('channel', 'delete', 'channel.delete', null),
  ('conversation', 'view', 'conversation.view', null),
  ('conversation', 'update', 'conversation.update', null),
  ('conversation', 'override', 'conversation.override', null),
  ('conversation', 'export', 'conversation.export', null),
  ('clinic_settings', 'view', 'clinic_settings.view', null),
  ('clinic_settings', 'update', 'clinic_settings.update', null),
  ('audit_log', 'view', 'audit_log.view', null),
  ('audit_log', 'export', 'audit_log.export', null);

-- Default role -> permission grants. Adjust freely; nothing depends on this
-- data yet since no request-time enforcement exists.
insert into role_permissions (role_id, permission_id)
select r.id, p.id from (values
  ('receptionist', 'appointment.view'), ('receptionist', 'appointment.create'), ('receptionist', 'appointment.update'),
  ('receptionist', 'appointment.cancel'), ('receptionist', 'appointment.reschedule'), ('receptionist', 'appointment.check_in'),
  ('receptionist', 'appointment.check_out'), ('receptionist', 'patient.view'), ('receptionist', 'patient.create'),
  ('receptionist', 'patient.update'), ('receptionist', 'conversation.view'), ('receptionist', 'conversation.update'),
  ('receptionist', 'service.view'), ('receptionist', 'branch.view'), ('receptionist', 'channel.view'),

  ('call_center_agent', 'appointment.view'), ('call_center_agent', 'appointment.create'), ('call_center_agent', 'appointment.update'),
  ('call_center_agent', 'appointment.cancel'), ('call_center_agent', 'appointment.reschedule'), ('call_center_agent', 'patient.view'),
  ('call_center_agent', 'patient.create'), ('call_center_agent', 'patient.update'), ('call_center_agent', 'conversation.view'),
  ('call_center_agent', 'conversation.update'), ('call_center_agent', 'service.view'), ('call_center_agent', 'branch.view'),

  ('doctor', 'appointment.view'), ('doctor', 'appointment.update'), ('doctor', 'appointment.check_out'),
  ('doctor', 'patient.view'), ('doctor', 'conversation.view'), ('doctor', 'service.view'),

  ('nurse', 'appointment.view'), ('nurse', 'appointment.update'), ('nurse', 'appointment.check_in'),
  ('nurse', 'appointment.check_out'), ('nurse', 'patient.view'), ('nurse', 'patient.update'), ('nurse', 'conversation.view'),

  ('insurance_officer', 'appointment.view'), ('insurance_officer', 'appointment.approve'), ('insurance_officer', 'patient.view'),
  ('insurance_officer', 'appointment.export'),

  ('cashier', 'appointment.view'), ('cashier', 'patient.view'),

  ('telemedicine_coordinator', 'appointment.view'), ('telemedicine_coordinator', 'appointment.create'),
  ('telemedicine_coordinator', 'appointment.update'), ('telemedicine_coordinator', 'appointment.reschedule'),
  ('telemedicine_coordinator', 'patient.view'), ('telemedicine_coordinator', 'conversation.view'),

  ('external_booking_channel', 'appointment.view'), ('external_booking_channel', 'appointment.create'),
  ('external_booking_channel', 'patient.create'),

  ('api_integration_user', 'appointment.view'), ('api_integration_user', 'appointment.create'),
  ('api_integration_user', 'appointment.update'), ('api_integration_user', 'patient.view'),
  ('api_integration_user', 'patient.create'), ('api_integration_user', 'service.view'), ('api_integration_user', 'branch.view'),

  ('automated_notification_service', 'appointment.view'), ('automated_notification_service', 'patient.view'),
  ('automated_notification_service', 'conversation.view'),

  ('ai_booking_assistant', 'appointment.view'), ('ai_booking_assistant', 'appointment.create'),
  ('ai_booking_assistant', 'patient.view'), ('ai_booking_assistant', 'patient.create'),
  ('ai_booking_assistant', 'conversation.view'), ('ai_booking_assistant', 'conversation.update'),
  ('ai_booking_assistant', 'service.view'), ('ai_booking_assistant', 'branch.view'),

  ('branch_manager', 'appointment.view'), ('branch_manager', 'appointment.create'), ('branch_manager', 'appointment.update'),
  ('branch_manager', 'appointment.cancel'), ('branch_manager', 'appointment.reschedule'), ('branch_manager', 'appointment.check_in'),
  ('branch_manager', 'appointment.check_out'), ('branch_manager', 'appointment.override'), ('branch_manager', 'appointment.approve'),
  ('branch_manager', 'appointment.export'), ('branch_manager', 'patient.view'), ('branch_manager', 'patient.create'),
  ('branch_manager', 'patient.update'), ('branch_manager', 'patient.export'), ('branch_manager', 'staff.view'),
  ('branch_manager', 'staff.update'), ('branch_manager', 'branch.view'), ('branch_manager', 'branch.update'),
  ('branch_manager', 'service.view'), ('branch_manager', 'service.update'), ('branch_manager', 'channel.view'),
  ('branch_manager', 'channel.update'), ('branch_manager', 'conversation.view'), ('branch_manager', 'conversation.update'),
  ('branch_manager', 'conversation.override'), ('branch_manager', 'clinic_settings.view')
) as grants(role_code, permission_code)
join roles r on r.code = grants.role_code
join permissions p on p.code = grants.permission_code;

-- clinic_manager and system_administrator: every permission.
insert into role_permissions (role_id, permission_id)
select r.id, p.id from roles r
cross join permissions p
where r.code in ('clinic_manager', 'system_administrator');
