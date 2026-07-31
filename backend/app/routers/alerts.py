from fastapi import APIRouter, Depends
from supabase import Client

from app.core.auth import CurrentStaff, allowed_branch_ids, assert_branch_access, require_permission
from app.core.database import get_supabase
from app.services.alerts import get_active_alerts

router = APIRouter(prefix="/alerts", tags=["alerts"])


@router.get("")
def list_alerts(
    branch_id: str | None = None,
    current: CurrentStaff = Depends(require_permission("appointment.view")),
    db: Client = Depends(get_supabase),
):
    """FR-ALT-001..018: currently active operational alerts, computed live —
    see get_active_alerts for what each condition checks and the ones that
    can't be checked yet (surfaced under not_implemented)."""
    if branch_id:
        assert_branch_access(current, "appointment.view", branch_id)
        branch_ids = [branch_id]
    else:
        branch_ids = allowed_branch_ids(current, "appointment.view")
        if branch_ids is not None and not branch_ids:
            return {"alerts": [], "not_implemented": []}
    return get_active_alerts(db, branch_ids)
