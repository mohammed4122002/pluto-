import httpx
from supabase import Client


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

    phone = None
    if patient_id:
        patient_rows = db.table("patients").select("phone").eq("id", patient_id).limit(1).execute().data
        phone = patient_rows[0]["phone"] if patient_rows else None

    try:
        httpx.post(
            channel["outbound_webhook_url"],
            json={"recipient": phone, "message": message, "channel_identifier": channel["identifier"]},
            timeout=10,
        )
    except httpx.HTTPError:
        pass
