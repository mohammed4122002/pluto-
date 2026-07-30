from datetime import datetime, timezone
from uuid import UUID

import httpx
from fastapi import APIRouter, Depends, HTTPException
from supabase import Client

from app.core.auth import CurrentStaff, allowed_branch_ids, assert_branch_access, require_permission
from app.core.database import get_supabase
from app.core.service_auth import require_service_token
from app.models.schemas import (
    ConversationDetail,
    ConversationSummary,
    ConversationUpdate,
    InboundMessage,
    InboundMessageResult,
    Message,
    StaffReplyCreate,
)
from app.services.channel_identity import (
    find_or_create_patient_by_phone,
    is_real_phone,
    link_patient_to_identity,
    resolve_external_user_id,
    resolve_identity,
)

router = APIRouter(prefix="/conversations", tags=["conversations"])


def _touch_conversation(db: Client, conversation_id: str, preview: str, sender: str) -> None:
    db.table("conversations").update(
        {
            "last_message_at": datetime.now(timezone.utc).isoformat(),
            "last_message_preview": preview[:200],
            "last_sender": sender,
        }
    ).eq("id", conversation_id).execute()


@router.post("/inbound", response_model=InboundMessageResult, dependencies=[Depends(require_service_token)])
def handle_inbound_message(payload: InboundMessage, db: Client = Depends(get_supabase)):
    """Called by n8n when a message arrives on a channel. Resolves the sender's
    channel identity first (PLUTO-COMPLETION-PROMPT.md 1.1) — not a patient
    record directly, since the same identity can message repeatedly with no
    phone number (Instagram/Messenger) or a fake one (legacy Telegram
    'tg:{chat_id}' payloads n8n still sends). Only once an identity resolves
    to a real phone does a patient record get created or matched. Records the
    inbound message and returns the conversation_id + mode so the workflow
    knows whether to generate an AI reply or leave it for a staff member."""
    channel_rows = db.table("channels").select("id, channel_type").eq("id", str(payload.channel_id)).execute().data
    if not channel_rows:
        # Validate the channel up front — otherwise a bad/fake channel_id would
        # still create an identity/patient row below before failing on the
        # conversation insert's FK check, leaving orphaned rows behind.
        raise HTTPException(status_code=404, detail="القناة غير موجودة")
    channel = channel_rows[0]

    provider_type = payload.provider_type or channel["channel_type"]
    external_user_id = resolve_external_user_id(provider_type, payload.patient_phone, payload.external_user_id)
    if not external_user_id:
        raise HTTPException(status_code=400, detail="بيانات هوية المرسل غير كافية (external_user_id أو patient_phone)")

    display_name = payload.display_name or payload.patient_name
    identity = resolve_identity(db, str(payload.channel_id), provider_type, external_user_id, display_name)

    patient_id = identity.get("patient_id")
    if not patient_id and payload.patient_phone:
        # Real phone -> proper dedup by phone across channels. Legacy
        # synthetic "tg:{chat_id}" values still get a patient record too
        # (booking/appointments require one today), just never treated as a
        # contactable phone number (is_real_phone gates that separately).
        patient_id = find_or_create_patient_by_phone(db, payload.patient_phone, display_name)
        phone_to_store = payload.patient_phone if is_real_phone(provider_type, payload.patient_phone) else None
        link_patient_to_identity(db, identity, patient_id, phone_number=phone_to_store)

    conversation_rows = (
        db.table("conversations")
        .select("id, mode")
        .eq("patient_channel_identity_id", identity["id"])
        .eq("status", "open")
        .execute()
        .data
    )
    if conversation_rows:
        conversation_id = conversation_rows[0]["id"]
        mode = conversation_rows[0]["mode"]
    else:
        created = (
            db.table("conversations")
            .insert(
                {
                    "channel_id": str(payload.channel_id),
                    "patient_id": patient_id,
                    "patient_channel_identity_id": identity["id"],
                }
            )
            .execute()
            .data[0]
        )
        conversation_id = created["id"]
        mode = created["mode"]

    db.table("messages").insert(
        {
            "conversation_id": conversation_id,
            "direction": "inbound",
            "sender_type": "patient",
            "content": payload.message,
        }
    ).execute()
    _touch_conversation(db, conversation_id, payload.message, "patient")

    return InboundMessageResult(conversation_id=conversation_id, patient_id=patient_id, mode=mode)


@router.get("", response_model=list[ConversationSummary])
def list_conversations(
    needs_attention: bool | None = None,
    mode: str | None = None,
    current: CurrentStaff = Depends(require_permission("conversation.view")),
    db: Client = Depends(get_supabase),
):
    query = db.table("conversations").select(
        "id, channel_id, status, mode, needs_attention, assigned_staff_id, last_message_at, "
        "last_message_preview, patient_id, "
        "channels(channel_type, branch_id), patients(full_name, phone)"
    ).order("last_message_at", desc=True, nullsfirst=False)
    if needs_attention is not None:
        query = query.eq("needs_attention", needs_attention)
    if mode:
        query = query.eq("mode", mode)
    rows = query.execute().data

    allowed = allowed_branch_ids(current, "conversation.view")
    summaries = []
    for row in rows:
        channel = row.pop("channels")
        if allowed is not None and channel["branch_id"] not in allowed:
            continue
        patient = row.pop("patients")
        summaries.append(
            ConversationSummary(
                **row,
                channel_type=channel["channel_type"],
                branch_id=channel["branch_id"],
                patient_name=patient["full_name"],
                patient_phone=patient["phone"],
            )
        )
    return summaries


@router.get("/{conversation_id}", response_model=ConversationDetail)
def get_conversation(
    conversation_id: UUID,
    current: CurrentStaff = Depends(require_permission("conversation.view")),
    db: Client = Depends(get_supabase),
):
    row = (
        db.table("conversations")
        .select(
            "id, channel_id, status, mode, needs_attention, assigned_staff_id, last_message_at, "
            "last_message_preview, patient_id, "
            "channels(channel_type, branch_id), patients(full_name, phone)"
        )
        .eq("id", str(conversation_id))
        .single()
        .execute()
        .data
    )
    channel = row.pop("channels")
    assert_branch_access(current, "conversation.view", channel["branch_id"])
    patient = row.pop("patients")
    messages = (
        db.table("messages")
        .select("id, conversation_id, direction, sender_type, content, created_at")
        .eq("conversation_id", str(conversation_id))
        .order("created_at")
        .execute()
        .data
    )
    return ConversationDetail(
        **row,
        channel_type=channel["channel_type"],
        branch_id=channel["branch_id"],
        patient_name=patient["full_name"],
        patient_phone=patient["phone"],
        messages=[Message(**m) for m in messages],
    )


def _conversation_branch_id(db: Client, conversation_id: str) -> str:
    row = (
        db.table("conversations")
        .select("channels(branch_id)")
        .eq("id", conversation_id)
        .single()
        .execute()
        .data
    )
    return row["channels"]["branch_id"]


@router.patch("/{conversation_id}", response_model=ConversationSummary)
def update_conversation(
    conversation_id: UUID,
    payload: ConversationUpdate,
    current: CurrentStaff = Depends(require_permission("conversation.update")),
    db: Client = Depends(get_supabase),
):
    assert_branch_access(current, "conversation.update", _conversation_branch_id(db, str(conversation_id)))
    updates = payload.model_dump(exclude_unset=True, mode="json")
    db.table("conversations").update(updates).eq("id", str(conversation_id)).execute()
    return _summary_of(db, conversation_id)


def _summary_of(db: Client, conversation_id: UUID) -> ConversationSummary:
    row = (
        db.table("conversations")
        .select(
            "id, channel_id, status, mode, needs_attention, assigned_staff_id, last_message_at, "
            "last_message_preview, patient_id, "
            "channels(channel_type, branch_id), patients(full_name, phone)"
        )
        .eq("id", str(conversation_id))
        .single()
        .execute()
        .data
    )
    channel = row.pop("channels")
    patient = row.pop("patients")
    return ConversationSummary(
        **row,
        channel_type=channel["channel_type"],
        branch_id=channel["branch_id"],
        patient_name=patient["full_name"],
        patient_phone=patient["phone"],
    )


@router.post("/{conversation_id}/reply", response_model=Message)
def staff_reply(
    conversation_id: UUID,
    payload: StaffReplyCreate,
    current: CurrentStaff = Depends(require_permission("conversation.update")),
    db: Client = Depends(get_supabase),
):
    """A staff member replies from the dashboard. Records the message, switches
    the conversation to human-handled, clears the escalation flag, and — if the
    channel has an outbound webhook configured — pushes the reply out through
    n8n to the real WhatsApp/Telegram chat."""
    assert_branch_access(current, "conversation.update", _conversation_branch_id(db, str(conversation_id)))
    message = (
        db.table("messages")
        .insert(
            {
                "conversation_id": str(conversation_id),
                "direction": "outbound",
                "sender_type": "staff",
                "content": payload.message,
            }
        )
        .execute()
        .data[0]
    )
    _touch_conversation(db, str(conversation_id), payload.message, "staff")
    db.table("conversations").update({"mode": "human", "needs_attention": False}).eq(
        "id", str(conversation_id)
    ).execute()

    conversation = (
        db.table("conversations")
        .select("channel_id, patients(phone)")
        .eq("id", str(conversation_id))
        .single()
        .execute()
        .data
    )
    channel = (
        db.table("channels")
        .select("identifier, outbound_webhook_url")
        .eq("id", conversation["channel_id"])
        .single()
        .execute()
        .data
    )
    if channel and channel.get("outbound_webhook_url"):
        try:
            httpx.post(
                channel["outbound_webhook_url"],
                json={
                    "recipient": conversation["patients"]["phone"],
                    "message": payload.message,
                    "channel_identifier": channel["identifier"],
                },
                timeout=10,
            )
        except httpx.HTTPError:
            pass

    return Message(**message)
