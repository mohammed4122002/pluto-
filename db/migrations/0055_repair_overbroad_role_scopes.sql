-- Repairs role grants that were widened to the whole clinic by accident.
--
-- `sync_legacy_role` used to fall back to a null (organization-wide) scope
-- whenever a staff member was created without picking a branch. A doctor or
-- receptionist created that way holds a clinic-wide grant they were never
-- meant to have. The code no longer produces such rows; this migration fixes
-- the ones already in the table.
--
-- Deliberately conservative: a null-scope row is only replaced when the staff
-- member actually has branch assignments to replace it with. Staff with no
-- `staff_branches` rows keep their grant and are left for an admin to assign
-- properly — revoking it here would lock them out of the dashboard entirely.
-- Their *data* is safe regardless: self-scoped roles are narrowed to their own
-- records in `app/core/scoping.py`, independently of branch scope.

insert into user_roles (staff_id, role_id, branch_id, granted_by)
select ur.staff_id, ur.role_id, sb.branch_id, ur.granted_by
from user_roles ur
join roles r on r.id = ur.role_id
join staff_branches sb on sb.staff_id = ur.staff_id
where ur.branch_id is null
  and r.code not in ('system_administrator', 'clinic_manager')
on conflict (staff_id, role_id, branch_id) do nothing;

delete from user_roles ur
using roles r
where ur.role_id = r.id
  and ur.branch_id is null
  and r.code not in ('system_administrator', 'clinic_manager')
  and exists (select 1 from staff_branches sb where sb.staff_id = ur.staff_id);
