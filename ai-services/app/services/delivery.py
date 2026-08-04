import httpx
from supabase import Client

_LEGACY_TELEGRAM_PREFIX = "tg:"


def _resolve_delivery_recipient(db: Client, channel_id: str, patient_id: str) -> str | None:
    """The outbound-webhook 'recipient' is NOT always patients.phone: once a
    patient tells the AI their real phone number for booking/records, that
    column no longer holds a synthetic routing id like Telegram's "tg:{chat_id}"
    -- it holds their actual phone, which n8n's Telegram sender would treat as
    a (bogus) chat_id. Resolve from this patient's channel identity for this
    exact channel instead; fall back to phone for channels (WhatsApp/SMS)
    where the phone number genuinely is the routing target."""
    identity = (
        db.table("patient_channel_identities")
        .select("provider_type, external_user_id")
        .eq("channel_id", channel_id)
        .eq("patient_id", patient_id)
        .limit(1)
        .execute()
        .data
    )
    if identity:
        provider_type = identity[0]["provider_type"]
        external_user_id = identity[0]["external_user_id"]
        if provider_type == "telegram":
            return f"{_LEGACY_TELEGRAM_PREFIX}{external_user_id}"
        return external_user_id
    rows = db.table("patients").select("phone").eq("id", patient_id).limit(1).execute().data
    return rows[0]["phone"] if rows else None


def deliver_outbound_message(db: Client, channel_id: str, patient_id: str | None, message: str) -> None:
    """Pushes a message to the patient outside of an n8n-triggered inbound
    turn — used by the stale-conversation reclaim job, which runs on its own
    schedule rather than inside an n8n execution that would otherwise relay
    /chat/reply's response back to the chat. Same mechanism the dashboard's
    manual staff-reply uses (backend/app/routers/conversations.py::staff_reply)."""
    channel_rows = (
        db.table("channels").select("identifier, outbound_webhook_url").eq("id", channel_id).limit(1).execute().data
    )
    if not channel_rows or not channel_rows[0].get("outbound_webhook_url"):
        return
    channel = channel_rows[0]

    recipient = _resolve_delivery_recipient(db, channel_id, patient_id) if patient_id else None

    try:
        httpx.post(
            channel["outbound_webhook_url"],
            json={"recipient": recipient, "message": message, "channel_identifier": channel["identifier"]},
            timeout=10,
        )
    except httpx.HTTPError:
        pass
