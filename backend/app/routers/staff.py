from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from supabase import Client

from app.core.auth import CurrentStaff, allowed_branch_ids, assert_branch_access, require_permission
from app.core.database import get_supabase
from app.core.rbac import sync_legacy_role
from app.core.security import hash_password
from app.models.schemas import SetPasswordRequest, Staff, StaffCreate, StaffUpdate

router = APIRouter(prefix="/staff", tags=["staff"])


def _attach_branch_ids(db: Client, staff: list[dict]) -> list[dict]:
    if not staff:
        return staff
    staff_ids = [s["id"] for s in staff]
    links = db.table("staff_branches").select("staff_id, branch_id").in_("staff_id", staff_ids).execute().data
    by_staff: dict[str, list[str]] = {}
    for link in links:
        by_staff.setdefault(link["staff_id"], []).append(link["branch_id"])
    for s in staff:
        s["branch_ids"] = by_staff.get(s["id"], [])
    return staff


def _attach_specialty_ids(db: Client, staff: list[dict]) -> list[dict]:
    if not staff:
        return staff
    staff_ids = [s["id"] for s in staff]
    links = (
        db.table("doctor_specialties").select("staff_id, specialty_id").in_("staff_id", staff_ids).execute().data
    )
    by_staff: dict[str, list[str]] = {}
    for link in links:
        by_staff.setdefault(link["staff_id"], []).append(link["specialty_id"])
    for s in staff:
        s["specialty_ids"] = by_staff.get(s["id"], [])
    return staff


@router.get("", response_model=list[Staff])
def list_staff(
    branch_id: str | None = None,
    role: str | None = None,
    current: CurrentStaff = Depends(require_permission("staff.view")),
    db: Client = Depends(get_supabase),
):
    allowed = allowed_branch_ids(current, "staff.view")

    if branch_id:
        assert_branch_access(current, "staff.view", branch_id)
        rows = db.table("staff_branches").select("staff_id, staff(*)").eq("branch_id", branch_id).execute().data
        staff = [row["staff"] for row in rows if row["staff"] and row["staff"].get("deleted_at") is None]
    else:
        staff = db.table("staff").select("*").is_("deleted_at", "null").order("full_name").execute().data
        if allowed is not None:
            if not allowed:
                return []
            visible_ids = {
                r["staff_id"]
                for r in db.table("staff_branches").select("staff_id, branch_id").in_("branch_id", allowed).execute().data
            }
            staff = [s for s in staff if s["id"] in visible_ids]

    if role:
        staff = [s for s in staff if s["role"] == role]
    return _attach_specialty_ids(db, _attach_branch_ids(db, staff))


@router.post("", response_model=Staff)
def create_staff(
    payload: StaffCreate, current: CurrentStaff = Depends(require_permission("staff.create")), db: Client = Depends(get_supabase)
):
    for bid in payload.branch_ids:
        assert_branch_access(current, "staff.create", str(bid))

    data = payload.model_dump(exclude={"branch_ids", "specialty_ids"})
    created = db.table("staff").insert(data).execute().data[0]
    if payload.branch_ids:
        db.table("staff_branches").insert(
            [{"staff_id": created["id"], "branch_id": str(bid)} for bid in payload.branch_ids]
        ).execute()
    if payload.specialty_ids:
        db.table("doctor_specialties").insert(
            [{"staff_id": created["id"], "specialty_id": str(sid)} for sid in payload.specialty_ids]
        ).execute()
    sync_legacy_role(db, created["id"], payload.role, [str(bid) for bid in payload.branch_ids])
    return _attach_specialty_ids(db, _attach_branch_ids(db, [created]))[0]


@router.post("/{staff_id}/specialties", response_model=Staff)
def add_staff_specialty(
    staff_id: UUID,
    specialty_id: UUID,
    _current: CurrentStaff = Depends(require_permission("staff.update")),
    db: Client = Depends(get_supabase),
):
    db.table("doctor_specialties").upsert(
        {"staff_id": str(staff_id), "specialty_id": str(specialty_id)}
    ).execute()
    staff = db.table("staff").select("*").eq("id", str(staff_id)).limit(1).execute().data
    if not staff:
        raise HTTPException(status_code=404, detail="الموظف غير موجود")
    return _attach_specialty_ids(db, _attach_branch_ids(db, staff))[0]


@router.delete("/{staff_id}/specialties/{specialty_id}")
def remove_staff_specialty(
    staff_id: UUID,
    specialty_id: UUID,
    _current: CurrentStaff = Depends(require_permission("staff.update")),
    db: Client = Depends(get_supabase),
):
    db.table("doctor_specialties").delete().eq("staff_id", str(staff_id)).eq(
        "specialty_id", str(specialty_id)
    ).execute()
    return {"deleted": True}


@router.patch("/{staff_id}", response_model=Staff)
def update_staff(
    staff_id: UUID,
    payload: StaffUpdate,
    current: CurrentStaff = Depends(require_permission("staff.update")),
    db: Client = Depends(get_supabase),
):
    existing_branches = [
        r["branch_id"] for r in db.table("staff_branches").select("branch_id").eq("staff_id", str(staff_id)).execute().data
    ]
    if existing_branches:
        # org-wide callers pass; branch-scoped callers need overlap with at least one of the target's branches
        allowed = allowed_branch_ids(current, "staff.update")
        if allowed is not None and not (set(allowed) & set(existing_branches)):
            raise HTTPException(status_code=403, detail="ليست لديك صلاحية على فرع هذا الموظف")
    else:
        assert_branch_access(current, "staff.update", None)

    updates = payload.model_dump(exclude_unset=True)
    if "is_active" in updates:
        updates["deactivated_at"] = None if updates["is_active"] else datetime.now(timezone.utc).isoformat()
    updated = db.table("staff").update(updates).eq("id", str(staff_id)).execute().data[0]
    return _attach_specialty_ids(db, _attach_branch_ids(db, [updated]))[0]


@router.post("/{staff_id}/set-password")
def set_password(
    staff_id: UUID,
    payload: SetPasswordRequest,
    current: CurrentStaff = Depends(require_permission("staff.update")),
    db: Client = Depends(get_supabase),
):
    db.table("staff").update({"password_hash": hash_password(payload.new_password)}).eq("id", str(staff_id)).execute()
    return {"password_set": True}
