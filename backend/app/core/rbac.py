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


def sync_legacy_role(db: Client, staff_id: str, legacy_role: str, branch_ids: list[str]) -> None:
    role_code = _LEGACY_ROLE_TO_RBAC_CODE.get(legacy_role)
    if not role_code:
        return
    try:
        role_row = db.table("roles").select("id").eq("code", role_code).limit(1).execute().data
        if not role_row:
            return
        role_id = role_row[0]["id"]
        # system_administrator is clinic-wide by convention, not per-branch.
        scopes = [None] if role_code == "system_administrator" or not branch_ids else branch_ids
        rows = [{"staff_id": staff_id, "role_id": role_id, "branch_id": b} for b in scopes]
        db.table("user_roles").insert(rows).execute()
    except Exception:
        logger.exception("sync_legacy_role failed for staff_id=%s role=%s", staff_id, legacy_role)
