from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from supabase import Client

from app.core.auth import CurrentStaff, assert_branch_access, require_permission
from app.core.database import get_supabase
from app.models.schemas import DoctorAvailability, DoctorAvailabilityCreate

router = APIRouter(prefix="/doctor-availability", tags=["doctor-availability"])


@router.get("", response_model=list[DoctorAvailability])
def list_doctor_availability(
    staff_id: str | None = None,
    branch_id: str | None = None,
    _current: CurrentStaff = Depends(require_permission("slot.view")),
    db: Client = Depends(get_supabase),
):
    query = db.table("doctor_availability").select("*").order("day_of_week")
    if staff_id:
        query = query.eq("staff_id", staff_id)
    if branch_id:
        query = query.eq("branch_id", branch_id)
    return query.execute().data


@router.post("", response_model=DoctorAvailability)
def create_doctor_availability(
    payload: DoctorAvailabilityCreate,
    current: CurrentStaff = Depends(require_permission("slot.manage")),
    db: Client = Depends(get_supabase),
):
    assert_branch_access(current, "slot.manage", str(payload.branch_id))
    data = payload.model_dump(mode="json")
    return db.table("doctor_availability").insert(data).execute().data[0]


@router.delete("/{availability_id}")
def delete_doctor_availability(
    availability_id: UUID,
    current: CurrentStaff = Depends(require_permission("slot.manage")),
    db: Client = Depends(get_supabase),
):
    rows = db.table("doctor_availability").select("branch_id").eq("id", str(availability_id)).limit(1).execute().data
    if not rows:
        raise HTTPException(status_code=404, detail="جدول الدوام غير موجود")
    assert_branch_access(current, "slot.manage", rows[0]["branch_id"])
    db.table("doctor_availability").delete().eq("id", str(availability_id)).execute()
    return {"deleted": True}
