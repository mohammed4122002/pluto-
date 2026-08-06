import logging
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, Depends, Header, HTTPException, Request
from supabase import Client

from app.core.database import get_supabase
from app.core.security import decrypt_secret
from app.routers.conversations import deliver_staff_reply

router = APIRouter(prefix="/staff-bot", tags=["staff-bot"])
logger = logging.getLogger(__name__)


def _clinic_settings(db: Client) -> dict:
    rows = (
        db.table("clinic_settings")
        .select("staff_bot_token_encrypted, staff_bot_webhook_secret")
        .limit(1)
        .execute()
        .data
    )
    return rows[0] if rows else {}


def _send_telegram_message(token: str, chat_id: str, text: str) -> dict | None:
    try:
        resp = httpx.post(
            f"https://api.telegram.org/bot{token}/sendMessage",
            json={"chat_id": chat_id, "text": text, "reply_markup": {"force_reply": True}},
            timeout=10,
        )
        data = resp.json()
        return data.get("result") if data.get("ok") else None
    except httpx.HTTPError:
        logger.exception("staff bot sendMessage failed")
        return None


def _handle_start(db: Client, token: str, chat_id: str, code: str) -> None:
    now = datetime.now(timezone.utc).isoformat()
    rows = (
        db.table("staff")
        .select("id, full_name")
        .eq("telegram_link_code", code)
        .gt("telegram_link_code_expires_at", now)
        .limit(1)
        .execute()
        .data
    )
    if not rows:
        _send_telegram_message(token, chat_id, "الكود غير صحيح أو منتهي الصلاحية -- ولّدي كود جديد من لوحة التحكم.")
        return
    db.table("staff").update(
        {"telegram_chat_id": chat_id, "telegram_link_code": None, "telegram_link_code_expires_at": None}
    ).eq("id", rows[0]["id"]).execute()
    _send_telegram_message(
        token, chat_id, f"تم الربط يا {rows[0]['full_name']} ✅ رح توصلك هون تنبيهات أي محادثة تتحوّل إلك."
    )


def _handle_reply(db: Client, token: str, chat_id: str, reply_to_message_id: int, text: str) -> None:
    staff_rows = db.table("staff").select("id").eq("telegram_chat_id", chat_id).limit(1).execute().data
    if not staff_rows:
        _send_telegram_message(token, chat_id, "هذا الحساب غير مربوط بأي موظف.")
        return
    staff_id = staff_rows[0]["id"]

    alert_rows = (
        db.table("staff_escalation_alerts")
        .select("conversation_id")
        .eq("staff_id", staff_id)
        .eq("telegram_message_id", reply_to_message_id)
        .limit(1)
        .execute()
        .data
    )
    if not alert_rows:
        _send_telegram_message(
            token, chat_id, "ما قدرت أعرف أي محادثة هذا الرد يخصها -- رُدّي (reply) على رسالة تنبيه فعلية."
        )
        return

    deliver_staff_reply(db, alert_rows[0]["conversation_id"], text)
    _send_telegram_message(token, chat_id, "✅ انبعت للمريض.")


@router.post("/telegram-webhook")
async def telegram_webhook(
    request: Request,
    db: Client = Depends(get_supabase),
    x_telegram_bot_api_secret_token: str | None = Header(default=None),
):
    """Telegram calls this directly on every message the staff bot receives
    -- no service token possible here (Telegram can't send our internal
    header), so this is secured instead by the secret_token Telegram itself
    echoes back on every call, set once when the bot token is saved (see
    routers/staff_bot_settings.py)."""
    settings_row = _clinic_settings(db)
    secret = settings_row.get("staff_bot_webhook_secret")
    if not secret or x_telegram_bot_api_secret_token != secret:
        raise HTTPException(status_code=401, detail="invalid webhook secret")

    token_encrypted = settings_row.get("staff_bot_token_encrypted")
    if not token_encrypted:
        return {"ok": True}
    token = decrypt_secret(token_encrypted)

    update = await request.json()
    message = update.get("message")
    if not message:
        return {"ok": True}

    chat_id = str(message["chat"]["id"])
    text = (message.get("text") or "").strip()
    reply_to = message.get("reply_to_message")

    if text.startswith("/start"):
        code = text.removeprefix("/start").strip()
        if code:
            _handle_start(db, token, chat_id, code)
        else:
            _send_telegram_message(token, chat_id, "أهلاً! ولّدي كود ربط من لوحة التحكم وابعتيه هون بصيغة /start <code>.")
    elif reply_to:
        _handle_reply(db, token, chat_id, reply_to["message_id"], text)
    else:
        _send_telegram_message(
            token, chat_id, "رُدّي (reply) على رسالة تنبيه محددة عشان يوصل ردك للمريض الصحيح."
        )

    return {"ok": True}
