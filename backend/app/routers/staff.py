import secrets
from datetime import date, datetime, timedelta, timezone
from uuid import UUID

import httpx
from fastapi import APIRouter, Depends, HTTPException
from supabase import Client

from app.core.auth import CurrentStaff, allowed_branch_ids, assert_branch_access, get_current_staff, require_permission
from app.core.config import get_settings
from app.core.database import get_supabase
from app.core.rbac import sync_legacy_role
from app.core.security import decrypt_secret, encrypt_secret, hash_password
from app.models.schemas import MyTelegramBotStatus, SetPasswordRequest, Staff, StaffBotTokenUpdate, StaffCreate, StaffUpdate
from app.services.slots import block_future_available_slots, generate_slots_for_doctor

router = APIRouter(prefix="/staff", tags=["staff"])


def _auto_enroll_escalation_pool(db: Client, staff_id: str, role: str) -> None:
    """Receptionists are the natural first responders for escalated
    conversations -- auto-enroll every one of them in the global escalation
    pool (branch_id=null) instead of making an admin add each new hire by
    hand from فريق التصعيد. Never removes anyone here: a deactivated or
    role-changed staff member is already excluded at assignment time
    (see escalation.pick_escalation_assignee's is_active filter), so a
    stale pool row is harmless -- and an admin's manual pool choices for
    other roles must never get silently undone by an unrelated staff edit."""
    if role != "receptionist":
        return
    db.table("escalation_staff").upsert(
        {"staff_id": staff_id, "branch_id": None, "is_active": True}, on_conflict="staff_id,branch_id"
    ).execute()


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

    if payload.role != "admin" and not payload.branch_ids:
        # Their permissions are scoped per branch, so a branchless doctor or
        # receptionist would end up with no usable grant at all. Catching it
        # here gives the admin something to fix instead of a broken account.
        raise HTTPException(status_code=400, detail="اختر فرعاً واحداً على الأقل — صلاحيات الموظف مرتبطة بفرعه")

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
    _auto_enroll_escalation_pool(db, created["id"], payload.role)
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
    if "role" in updates:
        _auto_enroll_escalation_pool(db, str(staff_id), updates["role"])
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


@router.get("/me/telegram-bot", response_model=MyTelegramBotStatus)
def get_my_telegram_bot(current: CurrentStaff = Depends(get_current_staff), db: Client = Depends(get_supabase)):
    rows = (
        db.table("staff")
        .select("telegram_bot_token_encrypted, telegram_bot_username, telegram_chat_id")
        .eq("id", current.id)
        .limit(1)
        .execute()
        .data
    )
    row = rows[0] if rows else {}
    return MyTelegramBotStatus(
        configured=bool(row.get("telegram_bot_token_encrypted")),
        username=row.get("telegram_bot_username"),
        linked=bool(row.get("telegram_chat_id")),
    )


@router.post("/me/telegram-bot/token", response_model=MyTelegramBotStatus)
def set_my_telegram_bot_token(
    payload: StaffBotTokenUpdate,
    current: CurrentStaff = Depends(get_current_staff),
    db: Client = Depends(get_supabase),
):
    """Self-service, no admin bottleneck: any staff member creates their own
    bot via BotFather and links it here. Validates the token against
    Telegram, points Telegram's webhook at this staff member's own URL
    (routers/staff_bot.py), and stores everything needed to talk back."""
    token = payload.token.strip()
    settings = get_settings()
    if not settings.backend_public_url:
        raise HTTPException(status_code=500, detail="BACKEND_PUBLIC_URL غير معرّف على السيرفر -- لازم يتضبط قبل ربط البوت")

    try:
        me_resp = httpx.get(f"https://api.telegram.org/bot{token}/getMe", timeout=10)
        me_data = me_resp.json()
    except httpx.HTTPError:
        raise HTTPException(status_code=400, detail="ما قدرت أتواصل مع تيليجرام -- جربي مرة تانية")
    if not me_data.get("ok"):
        raise HTTPException(status_code=400, detail="التوكن غير صحيح")
    username = me_data["result"].get("username")

    webhook_secret = secrets.token_hex(24)
    try:
        wh_resp = httpx.post(
            f"https://api.telegram.org/bot{token}/setWebhook",
            json={
                "url": f"{settings.backend_public_url}/staff-bot/telegram-webhook/{current.id}",
                "secret_token": webhook_secret,
            },
            timeout=10,
        )
        wh_data = wh_resp.json()
    except httpx.HTTPError:
        raise HTTPException(status_code=400, detail="التوكن صحيح بس ما قدرت أسجّل الـ webhook -- جربي مرة تانية")
    if not wh_data.get("ok"):
        raise HTTPException(status_code=400, detail=f"فشل تسجيل الـ webhook: {wh_data.get('description', '')}")

    db.table("staff").update(
        {
            "telegram_bot_token_encrypted": encrypt_secret(token),
            "telegram_bot_username": username,
            "telegram_bot_webhook_secret": webhook_secret,
            # a new bot means the old chat_id (if any) belonged to a
            # different bot and no longer receives anything
            "telegram_chat_id": None,
        }
    ).eq("id", current.id).execute()
    return MyTelegramBotStatus(configured=True, username=username, linked=False)


@router.delete("/me/telegram-bot/token", response_model=MyTelegramBotStatus)
def remove_my_telegram_bot_token(current: CurrentStaff = Depends(get_current_staff), db: Client = Depends(get_supabase)):
    rows = db.table("staff").select("telegram_bot_token_encrypted").eq("id", current.id).limit(1).execute().data
    token_encrypted = rows[0].get("telegram_bot_token_encrypted") if rows else None
    if token_encrypted:
        try:
            httpx.post(f"https://api.telegram.org/bot{decrypt_secret(token_encrypted)}/deleteWebhook", timeout=10)
        except httpx.HTTPError:
            pass
    db.table("staff").update(
        {
            "telegram_bot_token_encrypted": None,
            "telegram_bot_username": None,
            "telegram_bot_webhook_secret": None,
            "telegram_chat_id": None,
        }
    ).eq("id", current.id).execute()
    return MyTelegramBotStatus(configured=False, username=None, linked=False)
