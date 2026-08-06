import logging
from uuid import UUID

import httpx
from fastapi import APIRouter, Depends, Header, HTTPException, Request
from supabase import Client

from app.core.database import get_supabase
from app.core.security import decrypt_secret
from app.routers.conversations import deliver_staff_reply

router = APIRouter(prefix="/staff-bot", tags=["staff-bot"])
logger = logging.getLogger(__name__)


def _send_telegram_message(token: str, chat_id: str, text: str) -> None:
    try:
        httpx.post(
            f"https://api.telegram.org/bot{token}/sendMessage",
            json={"chat_id": chat_id, "text": text},
            timeout=10,
        )
    except httpx.HTTPError:
        logger.exception("staff bot sendMessage failed")


def _handle_reply(db: Client, token: str, chat_id: str, staff_id: str, reply_to_message_id: int, text: str) -> None:
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


@router.post("/telegram-webhook/{staff_id}")
async def telegram_webhook(
    staff_id: UUID,
    request: Request,
    db: Client = Depends(get_supabase),
    x_telegram_bot_api_secret_token: str | None = Header(default=None),
):
    """Telegram calls this directly on every message this staff member's own
    bot receives -- no service token possible here (Telegram can't send our
    internal header), so this is secured instead by the secret_token
    Telegram itself echoes back on every call, set once when the staff links
    their bot (see routers/staff.py::set_my_telegram_bot_token). The staff_id
    in the path is what lets one shared endpoint serve every staff member's
    distinct bot."""
    rows = (
        db.table("staff")
        .select("full_name, telegram_bot_token_encrypted, telegram_bot_webhook_secret")
        .eq("id", str(staff_id))
        .limit(1)
        .execute()
        .data
    )
    if not rows:
        raise HTTPException(status_code=404, detail="staff not found")
    staff_row = rows[0]

    secret = staff_row.get("telegram_bot_webhook_secret")
    if not secret or x_telegram_bot_api_secret_token != secret:
        raise HTTPException(status_code=401, detail="invalid webhook secret")

    token_encrypted = staff_row.get("telegram_bot_token_encrypted")
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
        db.table("staff").update({"telegram_chat_id": chat_id}).eq("id", str(staff_id)).execute()
        _send_telegram_message(
            token, chat_id, f"تم الربط يا {staff_row['full_name']} ✅ رح توصلك هون تنبيهات أي محادثة تتحوّل إلك."
        )
    elif reply_to:
        _handle_reply(db, token, chat_id, str(staff_id), reply_to["message_id"], text)
    else:
        _send_telegram_message(
            token, chat_id, "رُدّي (reply) على رسالة تنبيه محددة عشان يوصل ردك للمريض الصحيح."
        )

    return {"ok": True}
