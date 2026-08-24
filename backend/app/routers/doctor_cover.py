"""Substitute arrangements and per-doctor scheduling limits.

Both tables were readable-but-unwritable: `handle_doctor_absence` has a whole
reassign-to-a-substitute path that queries `doctor_substitutes`, and
`generate_slots_for_doctor` reads `doctor_limits` for buffers and the break
window -- but neither table had any write path at all, in the API or the UI.

For limits that just meant the feature sat dormant. For substitutes it was
worse than dormant: with the table permanently empty, `_find_substitute`
always returned None, so a doctor's absence *always* fell through to
cancelling every one of their appointments, even though the code to move
those patients to a covering doctor was sitting right there and working.
"""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from supabase import Client

from app.core.auth import CurrentStaff, allowed_branch_ids, assert_branch_access, require_permission
from app.core.database import get_supabase
from app.models.schemas import (
    DoctorLimits,
    DoctorLimitsUpdate,
    DoctorSubstitute,
    DoctorSubstituteCreate,
)

router = APIRouter(tags=["doctor-cover"])


# --- substitutes ------------------------------------------------------------


@router.get("/doctor-substitutes", response_model=list[DoctorSubstitute])
def list_substitutes(
    staff_id: str | None = None,
    current: CurrentStaff = Depends(require_permission("slot.view")),
    db: Client = Depends(get_supabase),
):
    query = db.table("doctor_substitutes").select("*").order("start_at", desc=True)
    if staff_id:
        query = query.eq("staff_id", staff_id)
    rows = query.execute().data

    # A branch-wide arrangement (branch_id null) is visible to anyone who can
    # see slots; a branch-scoped one only to people with access to that branch.
    allowed = allowed_branch_ids(current, "slot.view")
    if allowed is None:
        return rows
    return [r for r in rows if r["branch_id"] is None or r["branch_id"] in allowed]


@router.post("/doctor-substitutes", response_model=DoctorSubstitute)
def create_substitute(
    payload: DoctorSubstituteCreate,
    current: CurrentStaff = Depends(require_permission("slot.manage")),
    db: Client = Depends(get_supabase),
):
    if payload.staff_id == payload.substitute_staff_id:
        raise HTTPException(status_code=400, detail="ما بينفع الطبيب يكون بديل نفسه.")
    if payload.start_at >= payload.end_at:
        raise HTTPException(status_code=400, detail="بداية فترة التغطية لازم تكون قبل نهايتها.")
    if payload.branch_id:
        assert_branch_access(current, "slot.manage", str(payload.branch_id))

    ids = [str(payload.staff_id), str(payload.substitute_staff_id)]
    found = db.table("staff").select("id, is_active, role").in_("id", ids).execute().data
    if len(found) != 2:
        raise HTTPException(status_code=404, detail="أحد الطبيبين غير موجود.")
    substitute = next(s for s in found if s["id"] == str(payload.substitute_staff_id))
    if not substitute["is_active"]:
        # A deactivated doctor has no bookable slots, so reassignment to them
        # would silently fail and fall through to cancelling the patients --
        # exactly the outcome registering a substitute is meant to prevent.
        raise HTTPException(status_code=400, detail="الطبيب البديل غير مُفعّل — اختاري طبيب فعّال.")

    return db.table("doctor_substitutes").insert(payload.model_dump(mode="json")).execute().data[0]


@router.delete("/doctor-substitutes/{substitute_id}")
def delete_substitute(
    substitute_id: UUID,
    current: CurrentStaff = Depends(require_permission("slot.manage")),
    db: Client = Depends(get_supabase),
):
    rows = db.table("doctor_substitutes").select("branch_id").eq("id", str(substitute_id)).limit(1).execute().data
    if not rows:
        raise HTTPException(status_code=404, detail="ترتيب التغطية غير موجود")
    if rows[0]["branch_id"]:
        assert_branch_access(current, "slot.manage", rows[0]["branch_id"])
    db.table("doctor_substitutes").delete().eq("id", str(substitute_id)).execute()
    return {"deleted": True}


# --- per-doctor limits ------------------------------------------------------


@router.get("/doctor-limits/{staff_id}", response_model=DoctorLimits)
def get_limits(
    staff_id: UUID,
    _current: CurrentStaff = Depends(require_permission("slot.view")),
    db: Client = Depends(get_supabase),
):
    """Always answers, even for a doctor with no row yet -- an all-null record
    is the honest representation of "no limits configured", and it saves every
    caller from special-casing a 404 into the same empty form."""
    rows = db.table("doctor_limits").select("*").eq("staff_id", str(staff_id)).limit(1).execute().data
    return rows[0] if rows else DoctorLimits(staff_id=staff_id)


@router.put("/doctor-limits/{staff_id}", response_model=DoctorLimits)
def set_limits(
    staff_id: UUID,
    payload: DoctorLimitsUpdate,
    _current: CurrentStaff = Depends(require_permission("slot.manage")),
    db: Client = Depends(get_supabase),
):
    """Upsert, because the table has no row for most doctors and the caller
    shouldn't have to know whether this is the first time."""
    if (payload.break_start_time is None) != (payload.break_end_time is None):
        raise HTTPException(status_code=400, detail="فترة الاستراحة لازم يكون إلها بداية ونهاية، أو تكون فاضية تماماً.")
    if payload.break_start_time and payload.break_end_time and payload.break_start_time >= payload.break_end_time:
        raise HTTPException(status_code=400, detail="بداية الاستراحة لازم تكون قبل نهايتها.")

    data = payload.model_dump(mode="json")
    existing = db.table("doctor_limits").select("staff_id").eq("staff_id", str(staff_id)).limit(1).execute().data
    if existing:
        return db.table("doctor_limits").update(data).eq("staff_id", str(staff_id)).execute().data[0]
    return db.table("doctor_limits").insert({**data, "staff_id": str(staff_id)}).execute().data[0]
