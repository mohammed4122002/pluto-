import logging

import httpx
from supabase import Client

logger = logging.getLogger(__name__)


def pick_escalation_assignee(db: Client, branch_id: str | None) -> str | None:
    """Whoever is on escalation duty for this branch (falling back to the
    branch_id=null "all branches" pool) with the fewest currently-open
    assigned conversations right now -- a stateless least-loaded pick
    instead of tracking rotation state anywhere."""
    pool = (
        db.table("escalation_staff")
        .select("staff_id, staff(is_active)")
        .eq("is_active", True)
        .or_(f"branch_id.eq.{branch_id},branch_id.is.null" if branch_id else "branch_id.is.null")
        .execute()
        .data
    )
    candidate_ids = {row["staff_id"] for row in pool if (row.get("staff") or {}).get("is_active")}
    if not candidate_ids:
        return None

    open_convos = (
        db.table("conversations")
        .select("assigned_staff_id")
        .eq("status", "open")
        .in_("assigned_staff_id", list(candidate_ids))
        .execute()
        .data
    )
    load: dict[str, int] = {sid: 0 for sid in candidate_ids}
    for row in open_convos:
        if row["assigned_staff_id"] in load:
            load[row["assigned_staff_id"]] += 1

    return min(load, key=lambda sid: load[sid])


def _resolve_branch_id(db: Client, conversation_id: str) -> str | None:
    row = (
        db.table("conversations")
        .select("channels(branch_id)")
        .eq("id", conversation_id)
        .limit(1)
        .execute()
        .data
    )
    if not row:
        return None
    return (row[0].get("channels") or {}).get("branch_id")


def send_escalation_alert(db: Client, conversation_id: str, staff_id: str) -> None:
    """Best-effort: pushes a Telegram alert to the assignee via the staff
    bot's n8n webhook. Never raises -- an alert delivery hiccup must not
    break the escalation/assignment itself, same reasoning as every other
    notification path in this codebase."""
    try:
        staff_rows = db.table("staff").select("telegram_chat_id").eq("id", staff_id).limit(1).execute().data
        chat_id = staff_rows[0].get("telegram_chat_id") if staff_rows else None
        if not chat_id:
            return

        settings_rows = db.table("clinic_settings").select("staff_bot_webhook_url, staff_bot_identifier").limit(1).execute().data
        webhook_url = settings_rows[0].get("staff_bot_webhook_url") if settings_rows else None
        if not webhook_url:
            return
        identifier = settings_rows[0].get("staff_bot_identifier") or ""

        conv_rows = (
            db.table("conversations")
            .select("last_message_preview, patients(full_name, phone)")
            .eq("id", conversation_id)
            .limit(1)
            .execute()
            .data
        )
        patient = (conv_rows[0].get("patients") if conv_rows else None) or {}
        preview = (conv_rows[0].get("last_message_preview") if conv_rows else None) or ""
        message = (
            f"محادثة جديدة محتاجة ردك\n"
            f"المريض: {patient.get('full_name') or '—'} ({patient.get('phone') or '—'})\n"
            f"آخر رسالة: {preview}\n\n"
            f"رُدّي (reply) على هذه الرسالة بالذات عشان يوصل ردك للمريض مباشرة."
        )

        httpx.post(
            webhook_url,
            json={
                "telegram_chat_id": chat_id,
                "message": message,
                "conversation_id": conversation_id,
                "staff_id": staff_id,
                "channel_identifier": identifier,
            },
            timeout=10,
        )
    except Exception:
        logger.exception("send_escalation_alert failed for conversation_id=%s staff_id=%s", conversation_id, staff_id)


def auto_assign_conversation(db: Client, conversation_id: str) -> str | None:
    """Called whenever a conversation escalates to human (whatever the
    trigger -- keyword, turn limit, an AI provider failure). Best-effort:
    an assignment/alert hiccup must never block the escalation itself from
    going through. Returns the assigned staff_id, or None if the escalation
    pool is empty for this branch (conversation stays unassigned, same as
    before this feature existed -- a human still has to notice it in the
    dashboard)."""
    try:
        branch_id = _resolve_branch_id(db, conversation_id)
        staff_id = pick_escalation_assignee(db, branch_id)
        if not staff_id:
            return None
        db.table("conversations").update({"assigned_staff_id": staff_id}).eq("id", conversation_id).execute()
        send_escalation_alert(db, conversation_id, staff_id)
        return staff_id
    except Exception:
        logger.exception("auto_assign_conversation failed for conversation_id=%s", conversation_id)
        return None
