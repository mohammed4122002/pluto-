import secrets
from datetime import date, datetime, timedelta, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from supabase import Client

from app.core.auth import CurrentStaff, allowed_branch_ids, assert_branch_access, get_current_staff, require_permission
from app.core.database import get_supabase
from app.core.rbac import sync_legacy_role
from app.core.security import hash_password
from app.models.schemas import SetPasswordRequest, Staff, StaffCreate, StaffUpdate, TelegramLinkCode
from app.services.slots import block_future_available_slots, generate_slots_for_doctor

router = APIRouter(prefix="/staff", tags=["staff"])

_TELEGRAM_LINK_CODE_MINUTES = 10


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


def _attach_service_ids(db: Client, staff: list[dict]) -> list[dict]:
    if not staff:
        return staff
    staff_ids = [s["id"] for s in staff]
    links = db.table("service_doctors").select("staff_id, service_id").in_("staff_id", staff_ids).execute().data
    by_staff: dict[str, list[str]] = {}
    for link in links:
        by_staff.setdefault(link["staff_id"], []).append(link["service_id"])
    for s in staff:
        s["service_ids"] = by_staff.get(s["id"], [])
    return staff


def _attach_all(db: Client, staff: list[dict]) -> list[dict]:
    staff = _attach_service_ids(db, _attach_specialty_ids(db, _attach_branch_ids(db, staff)))
    for s in staff:
        s["telegram_linked"] = bool(s.get("telegram_chat_id"))
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
    return _attach_all(db, staff)


@router.post("", response_model=Staff)
def create_staff(
    payload: StaffCreate, current: CurrentStaff = Depends(require_permission("staff.create")), db: Client = Depends(get_supabase)
):
    for bid in payload.branch_ids:
        assert_branch_access(current, "staff.create", str(bid))

    data = payload.model_dump(exclude={"branch_ids", "specialty_ids", "service_ids", "schedule"})
    created = db.table("staff").insert(data).execute().data[0]
    if payload.branch_ids:
        db.table("staff_branches").insert(
            [{"staff_id": created["id"], "branch_id": str(bid)} for bid in payload.branch_ids]
        ).execute()
    if payload.specialty_ids:
        db.table("doctor_specialties").insert(
            [{"staff_id": created["id"], "specialty_id": str(sid)} for sid in payload.specialty_ids]
        ).execute()
    if payload.service_ids:
        db.table("service_doctors").insert(
            [{"staff_id": created["id"], "service_id": str(svid)} for svid in payload.service_ids]
        ).execute()
    if payload.schedule and payload.schedule.days and payload.branch_ids:
        # A new doctor is only actually bookable once working hours exist and
        # slots have been generated from them — do both right away instead of
        # leaving it as a separate, easy-to-miss step.
        branch_id = str(payload.branch_ids[0])
        db.table("doctor_availability").insert(
            [
                {
                    "staff_id": created["id"],
                    "branch_id": branch_id,
                    "day_of_week": day,
                    "start_time": payload.schedule.start_time.isoformat(),
                    "end_time": payload.schedule.end_time.isoformat(),
                    "slot_duration_minutes": payload.schedule.slot_duration_minutes,
                }
                for day in payload.schedule.days
            ]
        ).execute()
        generate_slots_for_doctor(db, created["id"], branch_id, date.today(), date.today() + timedelta(days=30))
    sync_legacy_role(db, created["id"], payload.role, [str(bid) for bid in payload.branch_ids])
    return _attach_all(db, [created])[0]


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
    return _attach_all(db, staff)[0]


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


@router.post("/{staff_id}/services", response_model=Staff)
def add_staff_service(
    staff_id: UUID,
    service_id: UUID,
    _current: CurrentStaff = Depends(require_permission("staff.update")),
    db: Client = Depends(get_supabase),
):
    db.table("service_doctors").upsert({"staff_id": str(staff_id), "service_id": str(service_id)}).execute()
    staff = db.table("staff").select("*").eq("id", str(staff_id)).limit(1).execute().data
    if not staff:
        raise HTTPException(status_code=404, detail="الموظف غير موجود")
    return _attach_all(db, staff)[0]


@router.delete("/{staff_id}/services/{service_id}")
def remove_staff_service(
    staff_id: UUID,
    service_id: UUID,
    _current: CurrentStaff = Depends(require_permission("staff.update")),
    db: Client = Depends(get_supabase),
):
    db.table("service_doctors").delete().eq("staff_id", str(staff_id)).eq("service_id", str(service_id)).execute()
    return {"deleted": True}


@router.post("/{staff_id}/branches", response_model=Staff)
def add_staff_branch(
    staff_id: UUID,
    branch_id: UUID,
    current: CurrentStaff = Depends(require_permission("staff.update")),
    db: Client = Depends(get_supabase),
):
    assert_branch_access(current, "staff.update", str(branch_id))
    db.table("staff_branches").upsert({"staff_id": str(staff_id), "branch_id": str(branch_id)}).execute()
    staff = db.table("staff").select("*").eq("id", str(staff_id)).limit(1).execute().data
    if not staff:
        raise HTTPException(status_code=404, detail="الموظف غير موجود")
    return _attach_all(db, staff)[0]


@router.delete("/{staff_id}/branches/{branch_id}")
def remove_staff_branch(
    staff_id: UUID,
    branch_id: UUID,
    current: CurrentStaff = Depends(require_permission("staff.update")),
    db: Client = Depends(get_supabase),
):
    assert_branch_access(current, "staff.update", str(branch_id))
    db.table("staff_branches").delete().eq("staff_id", str(staff_id)).eq("branch_id", str(branch_id)).execute()
    return {"deleted": True}


@router.delete("/{staff_id}")
def delete_staff(
    staff_id: UUID,
    current: CurrentStaff = Depends(require_permission("staff.delete")),
    db: Client = Depends(get_supabase),
):
    """Soft delete only — appointment/slot history keeps referencing this
    staff_id, so a hard delete would either fail on the FK or blow away real
    visit records. Hides the row everywhere is_active/deleted_at is checked."""
    existing_branches = [
        r["branch_id"] for r in db.table("staff_branches").select("branch_id").eq("staff_id", str(staff_id)).execute().data
    ]
    if existing_branches:
        allowed = allowed_branch_ids(current, "staff.delete")
        if allowed is not None and not (set(allowed) & set(existing_branches)):
            raise HTTPException(status_code=403, detail="ليست لديك صلاحية على فرع هذا الموظف")
    else:
        assert_branch_access(current, "staff.delete", None)

    db.table("staff").update(
        {
            "is_active": False,
            "deactivated_at": datetime.now(timezone.utc).isoformat(),
            "deleted_at": datetime.now(timezone.utc).isoformat(),
        }
    ).eq("id", str(staff_id)).execute()
    block_future_available_slots(db, str(staff_id))
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
    if updates.get("is_active") is False:
        block_future_available_slots(db, str(staff_id))
    return _attach_all(db, [updated])[0]


@router.post("/{staff_id}/set-password")
def set_password(
    staff_id: UUID,
    payload: SetPasswordRequest,
    current: CurrentStaff = Depends(require_permission("staff.update")),
    db: Client = Depends(get_supabase),
):
    db.table("staff").update({"password_hash": hash_password(payload.new_password)}).eq("id", str(staff_id)).execute()
    return {"password_set": True}


@router.post("/me/telegram-link-code", response_model=TelegramLinkCode)
def generate_my_telegram_link_code(
    current: CurrentStaff = Depends(get_current_staff), db: Client = Depends(get_supabase)
):
    """Self-service: any logged-in staff member can link their own Telegram
    to receive escalation alerts and reply through the staff bot -- no
    special permission needed beyond being a real, active staff account.
    The code is single-use and short-lived; the staff bot's n8n workflow
    calls POST /staff-bot/telegram-link with whatever the person sends it."""
    code = "".join(secrets.choice("0123456789") for _ in range(6))
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=_TELEGRAM_LINK_CODE_MINUTES)
    db.table("staff").update(
        {"telegram_link_code": code, "telegram_link_code_expires_at": expires_at.isoformat()}
    ).eq("id", current.id).execute()
    return TelegramLinkCode(code=code, expires_at=expires_at)
