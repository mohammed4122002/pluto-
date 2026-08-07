-- Pressing "نداء" (call) in the queue only ever updated the ticket/appointment
-- status -- fire_status_change_notifications already fires generically for
-- any on_status_change schedule, but no schedule existed for status='called',
-- so the patient never actually learned their turn had come. Adding the
-- template + schedule is enough; no application code changes needed.

insert into notification_templates (code, channel_type, language, subject, body_template, is_active)
values (
  'queue_called_ar',
  'whatsapp',
  'ar',
  null,
  'دورك جاي يا {{patient_name}} — تفضل/ي للكشف عند {{doctor_name}}.',
  true
);

insert into notification_schedules (template_id, trigger_type, offset_minutes, status_trigger, is_active)
select id, 'on_status_change', null, 'called', true
from notification_templates
where code = 'queue_called_ar';
