"""Branch closures (national holidays, one-off shutdowns).

The `branch_holidays` table and the slot generator's respect for it have both
existed since the original schema -- but nothing ever provided a way to *add*
a holiday, so the whole feature was unreachable in practice: the engine
faithfully skipped holidays that no one could enter. This is the missing
write path.
"""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from postgrest.exceptions import APIError
from supabase import Client

from app.core.auth import CurrentStaff, allowed_branch_ids, assert_branch_access, require_permission
from app.core.database import get_supabase
from app.models.schemas import BranchHoliday, BranchHolidayCreate, BranchHolidayResult
from app.services.slots import block_slots_for_holiday, unblock_slots_for_holiday

router = APIRouter(prefix="/branch-holidays", tags=["branch-holidays"])


@router.get("", response_model=list[BranchHoliday])
def list_holidays(
    branch_id: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    current: CurrentStaff = Depends(require_permission("slot.view")),
    db: Client = Depends(get_supabase),
):
    query = db.table("branch_holidays").select("*").order("holiday_date")
    if branch_id:
        assert_branch_access(current, "slot.view", branch_id)
        query = query.eq("branch_id", branch_id)
    else:
        allowed = allowed_branch_ids(current, "slot.view")
        if allowed is not None:
            if not allowed:
                return []
            query = query.in_("branch_id", allowed)
    if date_from:
        query = query.gte("holiday_date", date_from)
    if date_to:
        query = query.lte("holiday_date", date_to)
    return query.execute().data


@router.post("", response_model=BranchHolidayResult)
def create_holiday(
    payload: BranchHolidayCreate,
    current: CurrentStaff = Depends(require_permission("slot.manage")),
    db: Client = Depends(get_supabase),
):
    """Declares a closure and immediately takes that day's still-open slots
    off the market -- see block_slots_for_holiday for why doing only the
    former would be worse than not having the feature at all."""
    assert_branch_access(current, "slot.manage", str(payload.branch_id))

    if not payload.is_full_day and not (payload.start_time and payload.end_time):
        raise HTTPException(
            status_code=400,
            detail="الإغلاق الجزئي لازم يحدد وقت البداية والنهاية، أو خليه إغلاق يوم كامل.",
        )
    if payload.start_time and payload.end_time and payload.start_time >= payload.end_time:
        raise HTTPException(status_code=400, detail="وقت بداية الإغلاق لازم يكون قبل وقت نهايته.")

    data = payload.model_dump(mode="json")
    try:
        holiday = db.table("branch_holidays").insert(data).execute().data[0]
    except APIError as exc:
        # (branch_id, holiday_date) is unique -- declaring the same day twice
        # is a duplicate, not a server error.
        if exc.code == "23505":
            raise HTTPException(status_code=409, detail="هذا اليوم مسجّل كعطلة لهذا الفرع أصلاً.") from exc
        raise

    blocked = block_slots_for_holiday(db, holiday["id"], str(payload.branch_id), holiday)
    return BranchHolidayResult(holiday=holiday, blocked_slots=blocked)


@router.delete("/{holiday_id}")
def delete_holiday(
    holiday_id: UUID,
    current: CurrentStaff = Depends(require_permission("slot.manage")),
    db: Client = Depends(get_supabase),
):
    """Cancelling a closure reopens exactly the slots it closed -- a slot
    blocked for some other reason (a doctor's leave, an admin block) is left
    alone."""
    rows = db.table("branch_holidays").select("branch_id").eq("id", str(holiday_id)).limit(1).execute().data
    if not rows:
        raise HTTPException(status_code=404, detail="العطلة غير موجودة")
    assert_branch_access(current, "slot.manage", rows[0]["branch_id"])

    reopened = unblock_slots_for_holiday(db, str(holiday_id))
    db.table("branch_holidays").delete().eq("id", str(holiday_id)).execute()
    return {"deleted": True, "reopened_slots": reopened}
