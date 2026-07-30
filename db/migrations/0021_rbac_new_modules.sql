-- The slots/notifications/payments modules were built after the original RBAC
-- seed (0006_rbac.sql) and need their own permissions to be gate-able.

insert into permissions (resource, action, code, description) values
  ('slot', 'view', 'slot.view', null),
  ('slot', 'manage', 'slot.manage', 'generate/block/unblock schedule slots'),
  ('payment', 'view', 'payment.view', null),
  ('payment', 'manage', 'payment.manage', 'verify/reject payments, manage payment methods'),
  ('notification', 'view', 'notification.view', null);

insert into role_permissions (role_id, permission_id)
select r.id, p.id from (values
  ('receptionist', 'slot.view'),
  ('call_center_agent', 'slot.view'),
  ('doctor', 'slot.view'),
  ('nurse', 'slot.view'),
  ('telemedicine_coordinator', 'slot.view'),
  ('ai_booking_assistant', 'slot.view'),
  ('external_booking_channel', 'slot.view'),
  ('api_integration_user', 'slot.view'),

  ('receptionist', 'payment.view'),
  ('cashier', 'payment.view'), ('cashier', 'payment.manage'),

  ('branch_manager', 'slot.view'), ('branch_manager', 'slot.manage'),
  ('branch_manager', 'payment.view'), ('branch_manager', 'payment.manage'),
  ('branch_manager', 'notification.view')
) as grants(role_code, permission_code)
join roles r on r.code = grants.role_code
join permissions p on p.code = grants.permission_code;

insert into role_permissions (role_id, permission_id)
select r.id, p.id from roles r
cross join permissions p
where r.code in ('clinic_manager', 'system_administrator')
  and p.code in ('slot.view', 'slot.manage', 'payment.view', 'payment.manage', 'notification.view');
