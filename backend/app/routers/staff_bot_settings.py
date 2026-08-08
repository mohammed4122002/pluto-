import secrets

import httpx
from fastapi import APIRouter, Depends, HTTPException
from supabase import Client

from app.core.auth import CurrentStaff, require_permission
from app.core.config import get_settings
from app.core.database import get_supabase
from app.core.security import encrypt_secret
from app.models.schemas import StaffBotSettings, StaffBotTokenUpdate

router = APIRouter(prefix="/settings/staff-bot", tags=["settings"])


def _clinic_settings_id(db: Client) -> str:
    rows = db.table("clinic_settings").select("id").limit(1).execute().data
    if not rows:
        raise HTTPException(status_code=404, detail="إعدادات العيادة غير موجودة")
    return rows[0]["id"]


@router.get("", response_model=StaffBotSettings)
def get_staff_bot_settings(
    _current: CurrentStaff = Depends(require_permission("clinic_settings.view")), db: Client = Depends(get_supabase)
):
    rows = db.table("clinic_settings").select("staff_bot_token_encrypted, staff_bot_username").limit(1).execute().data
    row = rows[0] if rows else {}
    return StaffBotSettings(configured=bool(row.get("staff_bot_token_encrypted")), username=row.get("staff_bot_username"))


@router.post("/token", response_model=StaffBotSettings)
def set_staff_bot_token(
    payload: StaffBotTokenUpdate,
    _current: CurrentStaff = Depends(require_permission("clinic_settings.update")),
    db: Client = Depends(get_supabase),
):
    """Validates the token against Telegram's own API, points Telegram's
    webhook at this backend, and stores everything needed to talk back --
    all in one save, so there's nothing left to configure anywhere else.
    One admin does this once for the whole clinic; every staff member's own
    linking after that is self-service (see staff.py::generate_my_telegram_link_code)."""
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
                "url": f"{settings.backend_public_url}/staff-bot/telegram-webhook",
                "secret_token": webhook_secret,
            },
            timeout=10,
        )
        wh_data = wh_resp.json()
    except httpx.HTTPError:
        raise HTTPException(status_code=400, detail="التوكن صحيح بس ما قدرت أسجّل الـ webhook -- جربي مرة تانية")
    if not wh_data.get("ok"):
        raise HTTPException(status_code=400, detail=f"فشل تسجيل الـ webhook: {wh_data.get('description', '')}")

    clinic_settings_id = _clinic_settings_id(db)
    db.table("clinic_settings").update(
        {
            "staff_bot_token_encrypted": encrypt_secret(token),
            "staff_bot_username": username,
            "staff_bot_webhook_secret": webhook_secret,
        }
    ).eq("id", clinic_settings_id).execute()
    return StaffBotSettings(configured=True, username=username)


@router.delete("/token", response_model=StaffBotSettings)
def remove_staff_bot_token(
    _current: CurrentStaff = Depends(require_permission("clinic_settings.update")), db: Client = Depends(get_supabase)
):
    clinic_settings_id = _clinic_settings_id(db)
    db.table("clinic_settings").update(
        {"staff_bot_token_encrypted": None, "staff_bot_username": None, "staff_bot_webhook_secret": None}
    ).eq("id", clinic_settings_id).execute()
    return StaffBotSettings(configured=False, username=None)
