import json
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from openai import OpenAI
from pydantic import BaseModel
from supabase import Client

from app.core.config import Settings, get_settings
from app.core.database import get_supabase

router = APIRouter(prefix="/chat", tags=["chat"])

BASE_INSTRUCTIONS = (
    "You are the assistant for a medical clinic's messaging channel (WhatsApp/Telegram). "
    "Always reply in the same language and script the patient wrote in (e.g. Arabic in, "
    "Arabic out). Help patients with everyday questions: working hours, available "
    "services, and booking, confirming, or cancelling appointments — answer these "
    "directly and confidently using the clinic information below. Never invent working "
    "hours, prices, or services that aren't listed there. Keep replies short and "
    "conversational, like a real receptionist texting back.\n\n"
    "Set needs_human to true only for things that genuinely require a staff member: "
    "medical advice/diagnosis, complaints, refund/payment disputes, or requests you don't "
    "have information for. Do not escalate ordinary scheduling questions. When you set "
    "needs_human to true, still write a short reply letting the patient know someone will "
    "follow up shortly."
)


def _build_system_prompt(db: Client) -> str:
    settings_row = db.table("clinic_settings").select("clinic_name, about_text").limit(1).execute().data
    branches = (
        db.table("branches")
        .select("name, address, phone, working_hours_note")
        .eq("is_active", True)
        .execute()
        .data
    )
    services = (
        db.table("services").select("name, duration_minutes, price").eq("is_active", True).execute().data
    )

    parts = [BASE_INSTRUCTIONS]

    clinic_name = settings_row[0]["clinic_name"] if settings_row else ""
    about_text = settings_row[0]["about_text"] if settings_row else ""
    if clinic_name:
        parts.append(f"Clinic name: {clinic_name}")
    if about_text:
        parts.append(f"About the clinic: {about_text}")

    if branches:
        lines = ["Branches:"]
        for b in branches:
            details = [b["name"]]
            if b.get("address"):
                details.append(b["address"])
            if b.get("phone"):
                details.append(f"tel: {b['phone']}")
            if b.get("working_hours_note"):
                details.append(f"hours: {b['working_hours_note']}")
            lines.append("- " + " | ".join(details))
        parts.append("\n".join(lines))

    if services:
        lines = ["Services:"]
        for s in services:
            price = f"{s['price']}" if s.get("price") is not None else "N/A"
            lines.append(f"- {s['name']} ({s['duration_minutes']} min, price: {price})")
        parts.append("\n".join(lines))

    return "\n\n".join(parts)

REPLY_SCHEMA = {
    "type": "json_schema",
    "json_schema": {
        "name": "clinic_reply",
        "schema": {
            "type": "object",
            "properties": {
                "reply": {"type": "string"},
                "needs_human": {"type": "boolean"},
            },
            "required": ["reply", "needs_human"],
            "additionalProperties": False,
        },
        "strict": True,
    },
}


class ReplyRequest(BaseModel):
    conversation_id: str
    message: str


class ReplyResponse(BaseModel):
    reply: str
    needs_human: bool
    skipped: bool = False


def _get_openai(settings: Settings = Depends(get_settings)) -> OpenAI:
    if not settings.openai_api_key:
        raise HTTPException(
            status_code=501,
            detail="OPENAI_API_KEY not configured — set it in .env to enable reply generation.",
        )
    return OpenAI(api_key=settings.openai_api_key)


@router.post("/reply", response_model=ReplyResponse)
def generate_reply(
    payload: ReplyRequest,
    db: Client = Depends(get_supabase),
    client: OpenAI = Depends(_get_openai),
):
    """Called by the backend (or directly by n8n) to turn an inbound patient
    message into a reply, grounded in the conversation history stored in
    Supabase. Skips generating anything if the conversation has been switched
    to human-handled (a staff member is replying manually)."""
    conversation = (
        db.table("conversations").select("mode").eq("id", payload.conversation_id).single().execute().data
    )
    if conversation["mode"] == "human":
        return ReplyResponse(reply="", needs_human=True, skipped=True)

    history = (
        db.table("messages")
        .select("direction, content")
        .eq("conversation_id", payload.conversation_id)
        .order("created_at")
        .execute()
        .data
    )

    messages = [{"role": "system", "content": _build_system_prompt(db)}]
    for row in history:
        role = "user" if row["direction"] == "inbound" else "assistant"
        messages.append({"role": role, "content": row["content"]})
    messages.append({"role": "user", "content": payload.message})

    completion = client.chat.completions.create(
        model="gpt-4o-mini", messages=messages, response_format=REPLY_SCHEMA
    )
    parsed = json.loads(completion.choices[0].message.content)
    reply = parsed["reply"]
    needs_human = parsed["needs_human"]

    db.table("messages").insert(
        {
            "conversation_id": payload.conversation_id,
            "direction": "outbound",
            "sender_type": "ai",
            "content": reply,
        }
    ).execute()
    db.table("conversations").update(
        {
            "last_message_at": datetime.now(timezone.utc).isoformat(),
            "last_message_preview": reply[:200],
            "last_sender": "ai",
        }
    ).eq("id", payload.conversation_id).execute()

    if needs_human:
        db.table("conversations").update({"mode": "human", "needs_attention": True}).eq(
            "id", payload.conversation_id
        ).execute()

    return ReplyResponse(reply=reply, needs_human=needs_human)
