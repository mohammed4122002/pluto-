import logging

import httpx
from supabase import Client

from app.core.security import decrypt_secret

logger = logging.getLogger(__name__)


def _active_pool(db: Client, branch_id: str | None) -> list[dict]:
    """Active staff on escalation duty for this branch, falling back to the
    branch_id=null "all branches" pool. Rows carry the joined staff record,
    so callers can read is_active/telegram_chat_id without a second query."""
    pool = (
        db.table("escalation_staff")
        .select("staff_id, staff(is_active, telegram_chat_id)")
        .eq("is_active", True)
        .or_(f"branch_id.eq.{branch_id},branch_id.is.null" if branch_id else "branch_id.is.null")
        .execute()
        .data
    )
    return [row for row in pool if (row.get("staff") or {}).get("is_active")]


def pick_escalation_assignee(db: Client, branch_id: str | None) -> str | None:
    """Who *owns* an escalated conversation -- one person, so the dashboard
    has a single assignee and load stays balanced. This is distinct from who
    gets *notified*: broadcast_escalation_alert messages the whole linked
    pool, since any of them may be the one free to answer.

    Whoever is on escalation duty with the fewest currently-open assigned
    conversations right now -- a stateless least-loaded pick instead of
    tracking rotation state anywhere.

    Staff who have linked their Telegram chat are preferred over staff who
    haven't. Load-balancing alone would happily hand a conversation to
    someone who cannot be alerted at all: confirmed live, a complaint went
    to the pool member who happened to be idle, whose chat was never linked,
    so the alert was silently dropped while the busier-but-linked colleague
    sat available. An unlinked pick is only ever a last resort -- when
    nobody in the pool is linked, assigning someone still gives the
    conversation an owner in the dashboard, which beats leaving it
    unassigned entirely."""
    active = _active_pool(db, branch_id)
    if not active:
        return None

    linked_ids = {row["staff_id"] for row in active if (row.get("staff") or {}).get("telegram_chat_id")}
    candidate_ids = linked_ids or {row["staff_id"] for row in active}

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


def _bot_token(db: Client) -> str | None:
    """The one shared clinic bot's token (see routers/staff_bot_settings.py --
    every staff member links their own chat_id to this same bot, see
    routers/staff.py::generate_my_telegram_link_code)."""
    settings_rows = db.table("clinic_settings").select("staff_bot_token_encrypted").limit(1).execute().data
    token_encrypted = settings_rows[0].get("staff_bot_token_encrypted") if settings_rows else None
    return decrypt_secret(token_encrypted) if token_encrypted else None


def _build_alert_message(db: Client, conversation_id: str) -> str:
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

    # A single "last message" is often the bot's own reply (e.g. an
    # apology), not what the patient actually said -- next to useless
    # for a staff member deciding how to respond to a complaint. The
    # last few turns of actual back-and-forth give real context instead.
    history_rows = (
        db.table("messages")
        .select("sender_type, content")
        .eq("conversation_id", conversation_id)
        .order("created_at", desc=True)
        .limit(4)
        .execute()
        .data
    )
    history_rows.reverse()
    sender_label = {"patient": "المريض", "ai": "المساعد الذكي", "staff": "الموظف"}
    history_text = "\n".join(
        f"- {sender_label.get(r['sender_type'], r['sender_type'])}: {r['content']}" for r in history_rows
    ) or preview

    return (
        f"محادثة جديدة محتاجة ردك\n"
        f"المريض: {patient.get('full_name') or '—'} ({patient.get('phone') or '—'})\n\n"
        f"آخر الرسائل:\n{history_text}\n\n"
        f"رُدّي (reply) على هذه الرسالة بالذات عشان يوصل ردك للمريض مباشرة."
    )


def _deliver_alert(db: Client, conversation_id: str, staff_id: str, chat_id: str, token: str, message: str) -> bool:
    """One recipient. Records the sent message_id so a later reply-to-that-
    message traces back to this conversation (routers/staff_bot.py::
    _handle_reply) -- each recipient gets their own message_id, all mapping
    to the same conversation, so whoever replies first is the one who
    answers the patient."""
    resp = httpx.post(
        f"https://api.telegram.org/bot{token}/sendMessage",
        # force_reply auto-opens Telegram's reply box on this exact
        # message when the staff member taps it -- without it people
        # naturally just type in the normal chat box, which arrives as a
        # plain message (no reply_to_message) that staff_bot.py can't
        # trace back to a conversation.
        json={"chat_id": chat_id, "text": message, "reply_markup": {"force_reply": True}},
        timeout=10,
    )
    data = resp.json()
    if not data.get("ok"):
        logger.warning("staff bot alert send failed for staff_id=%s: %s", staff_id, data)
        return False

    db.table("staff_escalation_alerts").insert(
        {
            "conversation_id": conversation_id,
            "staff_id": staff_id,
            "telegram_message_id": data["result"]["message_id"],
        }
    ).execute()
    return True


def send_escalation_alert(db: Client, conversation_id: str, staff_id: str) -> None:
    """Alerts one specific staff member -- used when a human deliberately
    hands a conversation to a named colleague from the dashboard, where
    notifying the whole team would misrepresent a targeted hand-off.

    Never raises -- an alert delivery hiccup must not break the escalation/
    assignment itself, same reasoning as every other notification path in
    this codebase."""
    try:
        staff_rows = db.table("staff").select("telegram_chat_id").eq("id", staff_id).limit(1).execute().data
        chat_id = staff_rows[0].get("telegram_chat_id") if staff_rows else None
        if not chat_id:
            return
        token = _bot_token(db)
        if not token:
            return
        _deliver_alert(db, conversation_id, staff_id, chat_id, token, _build_alert_message(db, conversation_id))
    except Exception:
        logger.exception("send_escalation_alert failed for conversation_id=%s staff_id=%s", conversation_id, staff_id)


def broadcast_escalation_alert(db: Client, conversation_id: str, branch_id: str | None) -> int:
    """Alerts every linked member of the escalation pool, not just the
    assignee. They all share one bot but each has their own chat_id, so this
    is one send per person.

    Notifying only the assignee meant an escalation waited on one specific
    person being free, while colleagues on the same duty roster had no idea
    it existed. Ownership still belongs to a single assignee
    (pick_escalation_assignee) so the dashboard has one name and load stays
    balanced -- but whoever is actually free can pick it up, and replying
    from Telegram reassigns it to them (routers/staff_bot.py::_handle_reply).

    Returns how many staff were successfully alerted. Never raises; one
    recipient failing must not stop the rest from being told."""
    try:
        linked = [
            (row["staff_id"], (row.get("staff") or {})["telegram_chat_id"])
            for row in _active_pool(db, branch_id)
            if (row.get("staff") or {}).get("telegram_chat_id")
        ]
        if not linked:
            return 0
        token = _bot_token(db)
        if not token:
            return 0

        message = _build_alert_message(db, conversation_id)
        delivered = 0
        for staff_id, chat_id in linked:
            try:
                if _deliver_alert(db, conversation_id, staff_id, chat_id, token, message):
                    delivered += 1
            except Exception:
                logger.exception("escalation alert delivery failed for staff_id=%s", staff_id)
        return delivered
    except Exception:
        logger.exception("broadcast_escalation_alert failed for conversation_id=%s", conversation_id)
        return 0


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
        # The whole linked pool hears about it, not just the assignee -- see
        # broadcast_escalation_alert. The assignee owns it on paper; whoever
        # is free answers it in practice.
        broadcast_escalation_alert(db, conversation_id, branch_id)
        return staff_id
    except Exception:
        logger.exception("auto_assign_conversation failed for conversation_id=%s", conversation_id)
        return None
