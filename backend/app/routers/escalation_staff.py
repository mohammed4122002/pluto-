from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from supabase import Client

from app.core.auth import CurrentStaff, require_permission
from app.core.database import get_supabase
from app.models.schemas import EscalationStaffCreate, EscalationStaffMember

router = APIRouter(prefix="/escalation-staff", tags=["escalation-staff"])


@router.get("", response_model=list[EscalationStaffMember])
def list_escalation_staff(
    # conversation.view, not clinic_settings.view: any staff who can work the
    # inbox needs this list to populate the manual-transfer dropdown -- only
    # adding/removing pool membership stays admin-gated below.
    _current: CurrentStaff = Depends(require_permission("conversation.view")),
    db: Client = Depends(get_supabase),
):
    rows = db.table("escalation_staff").select("id, staff_id, branch_id, is_active, handles, staff(full_name)").execute().data
    return [
        EscalationStaffMember(
            id=r["id"],
            staff_id=r["staff_id"],
            staff_name=(r.get("staff") or {}).get("full_name"),
            branch_id=r["branch_id"],
            is_active=r["is_active"],
            handles=r.get("handles"),
        )
        for r in rows
    ]


@router.post("", response_model=EscalationStaffMember)
def add_escalation_staff(
    payload: EscalationStaffCreate,
    _current: CurrentStaff = Depends(require_permission("clinic_settings.update")),
    db: Client = Depends(get_supabase),
):
    data = payload.model_dump(mode="json")
    row = db.table("escalation_staff").upsert(data, on_conflict="staff_id,branch_id").execute().data[0]
    staff_rows = db.table("staff").select("full_name").eq("id", row["staff_id"]).limit(1).execute().data
    return EscalationStaffMember(
        id=row["id"],
        staff_id=row["staff_id"],
        staff_name=staff_rows[0]["full_name"] if staff_rows else None,
        branch_id=row["branch_id"],
        is_active=row["is_active"],
        handles=row.get("handles"),
    )


@router.delete("/{escalation_staff_id}")
def remove_escalation_staff(
    escalation_staff_id: UUID,
    _current: CurrentStaff = Depends(require_permission("clinic_settings.update")),
    db: Client = Depends(get_supabase),
):
    result = db.table("escalation_staff").delete().eq("id", str(escalation_staff_id)).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="غير موجود")
    return {"deleted": True}
