from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from supabase import Client

from app.core.auth import CurrentStaff, allowed_branch_ids, assert_branch_access, require_permission
from app.core.database import get_supabase
from app.core.scoping import StaffScope, get_staff_scope
from app.models.schemas import Queue, QueueTicket, QueueTicketUpdate, TriageRequest
from app.services.queue import call_ticket, complete_ticket, skip_ticket, start_ticket, update_ticket
from app.services.scheduling import record_triage

router = APIRouter(tags=["queue"])


@router.get("/queues/{queue_id}/tickets", response_model=list[QueueTicket])
def list_queue_tickets(
    queue_id: UUID,
    status: str | None = None,
    current: CurrentStaff = Depends(require_permission("queue.view")),
    scope: StaffScope = Depends(get_staff_scope),
    db: Client = Depends(get_supabase),
):
    queue_rows = db.table("queues").select("branch_id").eq("id", str(queue_id)).limit(1).execute().data
    if not queue_rows:
        raise HTTPException(status_code=404, detail="الطابور غير موجود")
    assert_branch_access(current, "queue.view", queue_rows[0]["branch_id"])
    # Branch access alone would hand a doctor every colleague's line at their
    # own branch -- ownership is the narrower rule and it wins.
    if scope.is_self_scoped and not scope.owns_queue(str(queue_id)):
        raise HTTPException(status_code=403, detail="هاد الطابور مو طابورك")

    query = db.table("queue_tickets").select("*").eq("queue_id", str(queue_id)).order("ticket_number")
    if status:
        query = query.eq("status", status)
    return query.execute().data


@router.get("/queues", response_model=list[Queue])
def list_queues(
    branch_id: str | None = None,
    queue_date: str | None = None,
    current: CurrentStaff = Depends(require_permission("queue.view")),
    scope: StaffScope = Depends(get_staff_scope),
    db: Client = Depends(get_supabase),
):
    query = db.table("queues").select("*").eq("is_active", True)
    if scope.is_self_scoped:
        query = query.eq("doctor_id", scope.staff_id)
    if branch_id:
        assert_branch_access(current, "queue.view", branch_id)
        query = query.eq("branch_id", branch_id)
    else:
        allowed = allowed_branch_ids(current, "queue.view")
        if allowed is not None:
            if not allowed:
                return []
            query = query.in_("branch_id", allowed)
    if queue_date:
        query = query.eq("queue_date", queue_date)
    return query.execute().data


def _ticket_branch_id(db: Client, ticket_id: str) -> str:
    rows = db.table("queue_tickets").select("queues(branch_id)").eq("id", ticket_id).limit(1).execute().data
    if not rows:
        raise HTTPException(status_code=404, detail="التذكرة غير موجودة")
    return rows[0]["queues"]["branch_id"]


@router.post("/queue-tickets/{ticket_id}/call", response_model=QueueTicket)
def call(
    ticket_id: UUID, current: CurrentStaff = Depends(require_permission("queue.manage")), db: Client = Depends(get_supabase)
):
    assert_branch_access(current, "queue.manage", _ticket_branch_id(db, str(ticket_id)))
    return call_ticket(db, str(ticket_id), current.id)


@router.post("/queue-tickets/{ticket_id}/skip", response_model=QueueTicket)
def skip(
    ticket_id: UUID, current: CurrentStaff = Depends(require_permission("queue.manage")), db: Client = Depends(get_supabase)
):
    assert_branch_access(current, "queue.manage", _ticket_branch_id(db, str(ticket_id)))
    return skip_ticket(db, str(ticket_id))


@router.post("/queue-tickets/{ticket_id}/start", response_model=QueueTicket)
def start(
    ticket_id: UUID, current: CurrentStaff = Depends(require_permission("queue.manage")), db: Client = Depends(get_supabase)
):
    assert_branch_access(current, "queue.manage", _ticket_branch_id(db, str(ticket_id)))
    return start_ticket(db, str(ticket_id), current.id)


@router.post("/queue-tickets/{ticket_id}/complete", response_model=QueueTicket)
def complete(
    ticket_id: UUID, current: CurrentStaff = Depends(require_permission("queue.manage")), db: Client = Depends(get_supabase)
):
    assert_branch_access(current, "queue.manage", _ticket_branch_id(db, str(ticket_id)))
    return complete_ticket(db, str(ticket_id), current.id)


@router.patch("/queue-tickets/{ticket_id}", response_model=QueueTicket)
def update(
    ticket_id: UUID,
    payload: QueueTicketUpdate,
    current: CurrentStaff = Depends(require_permission("queue.manage")),
    db: Client = Depends(get_supabase),
):
    assert_branch_access(current, "queue.manage", _ticket_branch_id(db, str(ticket_id)))
    return update_ticket(db, str(ticket_id), payload.priority_level, str(payload.queue_id) if payload.queue_id else None)


@router.post("/queue-tickets/{ticket_id}/triage", response_model=QueueTicket)
def triage(
    ticket_id: UUID,
    payload: TriageRequest,
    current: CurrentStaff = Depends(require_permission("queue.manage")),
    db: Client = Depends(get_supabase),
):
    """FR-WIN-006: records a nurse's triage assessment against the ticket."""
    assert_branch_access(current, "queue.manage", _ticket_branch_id(db, str(ticket_id)))
    return record_triage(db, str(ticket_id), payload.triage_level, payload.triage_notes, current.id)
