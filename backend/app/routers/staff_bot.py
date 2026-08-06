from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from supabase import Client

from app.core.database import get_supabase
from app.core.service_auth import require_service_token
from app.models.schemas import Message, RecordAlertMessage, StaffBotReply, TelegramLinkConfirm
from app.routers.conversations import deliver_staff_reply

router = APIRouter(prefix="/staff-bot", tags=["staff-bot"])


@router.post("/telegram-link", dependencies=[Depends(require_service_token)])
def confirm_telegram_link(payload: TelegramLinkConfirm, db: Client = Depends(get_supabase)):
    """Called by the staff bot's n8n workflow when someone sends /start
    <code>. Matches the code to whoever generated it (POST
    /staff/me/telegram-link-code) and hasn't let it expire."""
    now = datetime.now(timezone.utc).isoformat()
    rows = (
        db.table("staff")
        .select("id")
        .eq("telegram_link_code", payload.code)
        .gt("telegram_link_code_expires_at", now)
        .limit(1)
        .execute()
        .data
    )
    if not rows:
        raise HTTPException(status_code=404, detail="الكود غير صحيح أو منتهي الصلاحية")
    staff_id = rows[0]["id"]
    db.table("staff").update(
        {
            "telegram_chat_id": payload.telegram_chat_id,
            "telegram_link_code": None,
            "telegram_link_code_expires_at": None,
        }
    ).eq("id", staff_id).execute()
    return {"linked": True}


@router.post("/record-alert-message", dependencies=[Depends(require_service_token)])
def record_alert_message(payload: RecordAlertMessage, db: Client = Depends(get_supabase)):
    """Called by the staff bot's n8n workflow right after it sends an
    escalation alert to Telegram, with the message_id Telegram handed back --
    this is what lets a later reply-to-that-message be traced to the right
    conversation."""
    db.table("staff_escalation_alerts").insert(
        {
            "conversation_id": str(payload.conversation_id),
            "staff_id": str(payload.staff_id),
            "telegram_message_id": payload.telegram_message_id,
        }
    ).execute()
    return {"recorded": True}


@router.post("/reply", response_model=Message, dependencies=[Depends(require_service_token)])
def staff_bot_reply(payload: StaffBotReply, db: Client = Depends(get_supabase)):
    """Called by the staff bot's n8n workflow when a linked staff member
    replies (Telegram's native reply-to) to one of their escalation alerts.
    Resolves who they are from their chat_id, which conversation from the
    alert they replied to, and delivers it exactly like a dashboard reply."""
    staff_rows = db.table("staff").select("id").eq("telegram_chat_id", payload.telegram_chat_id).limit(1).execute().data
    if not staff_rows:
        raise HTTPException(status_code=404, detail="هذا الحساب غير مربوط بأي موظف")
    staff_id = staff_rows[0]["id"]

    alert_rows = (
        db.table("staff_escalation_alerts")
        .select("conversation_id")
        .eq("staff_id", staff_id)
        .eq("telegram_message_id", payload.reply_to_telegram_message_id)
        .limit(1)
        .execute()
        .data
    )
    if not alert_rows:
        raise HTTPException(
            status_code=404, detail="ما قدرت أعرف أي محادثة هذا الرد يخصها -- رُدّي على رسالة تنبيه إسناد فعلية."
        )
    conversation_id = alert_rows[0]["conversation_id"]
    return Message(**deliver_staff_reply(db, conversation_id, payload.text))
