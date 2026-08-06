-- Two capabilities that were riding on permissions meant for something else.
--
-- import.execute: 0032 added import.view (read history) and import.undo, but
-- the endpoints that *run* an import — preview a source, dry-run, execute a
-- job, test a Postgres/Google Sheets connection — were gated on authentication
-- alone. Any signed-in staff member could bulk-write patients and appointments
-- into the database, or hand the server an arbitrary connection string. It is
-- granted here to the managing roles only; reception keeps import.view so it
-- can still see what was imported and when.
--
-- bot_performance.view: the AI assistant's clinic-wide metrics screen was
-- gated on appointment.view, which every clinical role holds — so a doctor
-- reading their own schedule also got the clinic's bot analytics.

insert into permissions (resource, action, code, description) values
  ('import', 'execute', 'import.execute', 'run an import: preview a source, dry-run, and execute a job'),
  ('bot_performance', 'view', 'bot_performance.view', 'عرض مقاييس أداء المساعد الذكي على مستوى العيادة');

insert into role_permissions (role_id, permission_id)
select r.id, p.id from (values
  ('branch_manager', 'import.execute'),
  ('branch_manager', 'bot_performance.view')
) as grants(role_code, permission_code)
join roles r on r.code = grants.role_code
join permissions p on p.code = grants.permission_code;

insert into role_permissions (role_id, permission_id)
select r.id, p.id from roles r
cross join permissions p
where r.code in ('clinic_manager', 'system_administrator')
  and p.code in ('import.execute', 'bot_performance.view');
