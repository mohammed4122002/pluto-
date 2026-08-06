import logging

from supabase import Client

logger = logging.getLogger(__name__)

# Maps the legacy staff.role enum onto the new RBAC role catalog (0006_rbac.sql).
# Kept here so both /setup and /staff insert consistent user_roles rows without
# any request-time permission enforcement — that lands once auth exists.
_LEGACY_ROLE_TO_RBAC_CODE = {
    "admin": "system_administrator",
    "doctor": "doctor",
    "receptionist": "receptionist",
}

# Roles whose remit really is the whole clinic, so a null (organization-wide)
# scope is the correct grant. Everyone else is granted per branch — the old
# code fell back to a null scope whenever no branch was picked, which silently
# handed a brand-new doctor or receptionist clinic-wide reach.
_CLINIC_WIDE_ROLES = {"system_administrator", "clinic_manager"}


def sync_legacy_role(db: Client, staff_id: str, legacy_role: str, branch_ids: list[str]) -> None:
    role_code = _LEGACY_ROLE_TO_RBAC_CODE.get(legacy_role)
    if not role_code:
        return
    try:
        role_row = db.table("roles").select("id").eq("code", role_code).limit(1).execute().data
        if not role_row:
            return
        role_id = role_row[0]["id"]
        scopes: list[str | None] = [None] if role_code in _CLINIC_WIDE_ROLES else list(branch_ids)
        if not scopes:
            # Better to grant nothing than to grant everything. The staff
            # router rejects this case up front with a message the admin can
            # act on; reaching here means some other caller skipped that check.
            logger.warning(
                "no branch scope for staff_id=%s role=%s — granting no permissions rather than clinic-wide",
                staff_id,
                legacy_role,
            )
            return
        rows = [{"staff_id": staff_id, "role_id": role_id, "branch_id": b} for b in scopes]
        db.table("user_roles").insert(rows).execute()
    except Exception:
        logger.exception("sync_legacy_role failed for staff_id=%s role=%s", staff_id, legacy_role)
