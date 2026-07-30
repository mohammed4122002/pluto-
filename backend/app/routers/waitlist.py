from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException
from supabase import Client

from app.core.auth import CurrentStaff, allowed_branch_ids, assert_branch_access, get_current_staff, require_permission
from app.core.config import get_settings
from app.core.database import get_supabase
from app.core.service_auth import require_service_token
from app.models.schemas import WaitlistCreate, WaitlistEntry, WaitlistOfferAcceptResult, WaitlistUpdate
from app.services.waitlist import accept_offer, decline_offer, process_expired_offers

router = APIRouter(tags=["waitlist"])


def _require_staff_or_service(authorization: str | None, x_service_token: str | None, db: Client) -> None:
    """The patient responds to a waitlist offer over WhatsApp/Telegram — n8n
    relays that as a service-token call. A staff member can also record the
    response manually from the dashboard (a phone confirmation, say)."""
    settings = get_settings()
    if bool(settings.service_token) and x_service_token == settings.service_token:
        return
    current = get_current_staff(authorization=authorization, db=db)
    if not current.has_permission("waitlist.manage"):
        raise HTTPException(status_code=403, detail="ليست لديك صلاحية لهذا الإجراء")


@router.get("/waitlist", response_model=list[WaitlistEntry])
def list_waitlist(
    branch_id: str | None = None,
    status: str | None = None,
    current: CurrentStaff = Depends(require_permission("waitlist.view")),
    db: Client = Depends(get_supabase),
):
    query = db.table("waitlist").select("*").order("created_at")
    if branch_id:
        assert_branch_access(current, "waitlist.view", branch_id)
        query = query.eq("branch_id", branch_id)
    else:
        allowed = allowed_branch_ids(current, "waitlist.view")
        if allowed is not None:
            if not allowed:
                return []
            query = query.in_("branch_id", allowed)
    if status:
        query = query.eq("status", status)
    return query.execute().data


@router.post("/waitlist", response_model=WaitlistEntry)
def add_to_waitlist(
    payload: WaitlistCreate, current: CurrentStaff = Depends(require_permission("waitlist.manage")), db: Client = Depends(get_supabase)
):
    assert_branch_access(current, "waitlist.manage", str(payload.branch_id))
    return db.table("waitlist").insert(payload.model_dump(mode="json")).execute().data[0]


def _waitlist_branch_id(db: Client, waitlist_id: str) -> str:
    rows = db.table("waitlist").select("branch_id").eq("id", waitlist_id).limit(1).execute().data
    if not rows:
        raise HTTPException(status_code=404, detail="طلب الانتظار غير موجود")
    return rows[0]["branch_id"]


@router.patch("/waitlist/{waitlist_id}", response_model=WaitlistEntry)
def update_waitlist_entry(
    waitlist_id: UUID,
    payload: WaitlistUpdate,
    current: CurrentStaff = Depends(require_permission("waitlist.manage")),
    db: Client = Depends(get_supabase),
):
    assert_branch_access(current, "waitlist.manage", _waitlist_branch_id(db, str(waitlist_id)))
    updates = payload.model_dump(exclude_unset=True)
    return db.table("waitlist").update(updates).eq("id", str(waitlist_id)).execute().data[0]


@router.post("/waitlist-offers/{offer_id}/accept", response_model=WaitlistOfferAcceptResult)
def accept_waitlist_offer(
    offer_id: UUID,
    authorization: str | None = Header(default=None),
    x_service_token: str | None = Header(default=None),
    db: Client = Depends(get_supabase),
):
    _require_staff_or_service(authorization, x_service_token, db)
    appointment_id = accept_offer(db, str(offer_id))
    return WaitlistOfferAcceptResult(appointment_id=appointment_id)


@router.post("/waitlist-offers/{offer_id}/decline")
def decline_waitlist_offer(
    offer_id: UUID,
    authorization: str | None = Header(default=None),
    x_service_token: str | None = Header(default=None),
    db: Client = Depends(get_supabase),
):
    _require_staff_or_service(authorization, x_service_token, db)
    decline_offer(db, str(offer_id))
    return {"declined": True}


@router.post("/waitlist/process-expired", dependencies=[Depends(require_service_token)])
def process_expired(db: Client = Depends(get_supabase)):
    """Called by an external scheduler (n8n Cron) to expire offers past their
    deadline and fall through to the next waitlist candidate — same pattern as
    /notifications/process-due."""
    return {"processed": process_expired_offers(db)}
