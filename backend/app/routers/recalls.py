from fastapi import APIRouter, Depends
from supabase import Client

from app.core.auth import CurrentStaff, allowed_branch_ids, assert_branch_access, require_permission
from app.core.database import get_supabase
from app.core.service_auth import require_service_token
from app.models.schemas import Recall, RecallCreate
from app.services.recalls import create_recall, escalate_unresponsive_recalls, send_due_recall_invitations

router = APIRouter(prefix="/recalls", tags=["recalls"])


@router.get("", response_model=list[Recall])
def list_recalls(
    branch_id: str | None = None,
    status: str | None = None,
    current: CurrentStaff = Depends(require_permission("recall.manage")),
    db: Client = Depends(get_supabase),
):
    query = db.table("recalls").select("*").order("due_date")
    if branch_id:
        assert_branch_access(current, "recall.manage", branch_id)
        query = query.eq("branch_id", branch_id)
    else:
        allowed = allowed_branch_ids(current, "recall.manage")
        if allowed is not None:
            if not allowed:
                return []
            query = query.in_("branch_id", allowed)
    if status:
        query = query.eq("status", status)
    return query.execute().data


@router.post("", response_model=Recall)
def create(
    payload: RecallCreate,
    current: CurrentStaff = Depends(require_permission("recall.manage")),
    db: Client = Depends(get_supabase),
):
    """FR-RCL-001/003: a doctor (or receptionist/branch manager) schedules a
    future follow-up for a patient — by a specific date, N days out, or tied
    to a medical result/treatment plan/vaccination/periodic checkup."""
    assert_branch_access(current, "recall.manage", str(payload.branch_id))
    result = create_recall(
        db,
        str(payload.patient_id),
        str(payload.branch_id),
        str(payload.doctor_id) if payload.doctor_id else None,
        str(payload.service_id) if payload.service_id else None,
        payload.due_date.isoformat(),
        payload.reason_type,
        payload.reason_notes,
        None,
        current.id,
    )
    return result


@router.post("/process-due", dependencies=[Depends(require_service_token)])
def process_due(db: Client = Depends(get_supabase)):
    """FR-RCL-004: called by an external scheduler, same pattern as
    POST /notifications/process-due — invites every patient whose recall is
    due today or earlier and hasn't been invited yet."""
    return {"invitations_sent": send_due_recall_invitations(db)}


@router.post("/escalate-overdue", dependencies=[Depends(require_service_token)])
def escalate_overdue(db: Client = Depends(get_supabase)):
    """FR-RCL-006: escalates recalls invited too long ago with no response
    so the call center can follow up by phone."""
    return {"escalated_count": escalate_unresponsive_recalls(db)}
