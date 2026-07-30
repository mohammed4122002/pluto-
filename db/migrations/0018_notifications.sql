-- Phase 3.2 (FR-NOT-001..018). Delivery still goes through n8n per the
-- architecture (n8n only ever transports messages) — these tables + the
-- /notifications endpoints compute WHAT is due and log WHAT was sent; wiring
-- an actual n8n Cron trigger to poll GET /notifications/due is a separate,
-- manual n8n-workflow step outside this backend change.

create table notification_templates (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  channel_type text not null check (channel_type in ('sms', 'whatsapp', 'email', 'push', 'in_app')),
  language text not null default 'ar' check (language in ('ar', 'en')),
  subject text,
  body_template text not null,
  is_active boolean not null default true
);

-- offset_minutes: negative = before the appointment (e.g. -1440 = 24h prior),
-- positive = after (e.g. +60 = 1h post-visit follow-up). Only used when
-- trigger_type = 'before_appointment' / 'after_appointment'.
create table notification_schedules (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references notification_templates(id) on delete cascade,
  trigger_type text not null check (trigger_type in ('before_appointment', 'after_appointment', 'on_status_change')),
  offset_minutes int,
  status_trigger appointment_status,
  is_active boolean not null default true
);

create table notification_log (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid references appointments(id) on delete cascade,
  schedule_id uuid references notification_schedules(id) on delete set null,
  template_id uuid references notification_templates(id) on delete set null,
  channel_type text not null,
  recipient text not null,
  status text not null default 'pending' check (status in ('pending', 'sent', 'delivered', 'failed', 'read')),
  sent_at timestamptz,
  error_message text,
  created_at timestamptz not null default now()
);

create index notification_log_appointment_idx on notification_log (appointment_id);

alter table notification_templates enable row level security;
alter table notification_schedules enable row level security;
alter table notification_log enable row level security;

insert into notification_templates (code, channel_type, language, body_template) values
  ('reminder_24h_ar', 'whatsapp', 'ar', 'تذكير: عندك موعد يوم {{date}} الساعة {{time}} مع {{doctor_name}} بفرع {{branch_name}}. لتأكيد الموعد رد بكلمة "تأكيد".'),
  ('reminder_2h_ar', 'whatsapp', 'ar', 'تذكير: موعدك بعد ساعتين ({{time}}) مع {{doctor_name}}. نتشرف بزيارتك.'),
  ('booking_confirmation_ar', 'whatsapp', 'ar', 'تم تأكيد حجزك رقم {{appointment_number}} يوم {{date}} الساعة {{time}}. رمز الدخول: {{confirmation_code}}.'),
  ('post_visit_followup_ar', 'whatsapp', 'ar', 'شكراً لزيارتك اليوم! كيف كانت تجربتك معنا؟ رد برقم من 1 إلى 5.');

insert into notification_schedules (template_id, trigger_type, offset_minutes)
select id, 'before_appointment', -1440 from notification_templates where code = 'reminder_24h_ar'
union all
select id, 'before_appointment', -120 from notification_templates where code = 'reminder_2h_ar'
union all
select id, 'after_appointment', 60 from notification_templates where code = 'post_visit_followup_ar';

insert into notification_schedules (template_id, trigger_type, status_trigger)
select id, 'on_status_change', 'confirmed' from notification_templates where code = 'booking_confirmation_ar';
