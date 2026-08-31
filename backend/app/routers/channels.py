import json
import logging
from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException
from supabase import Client

from app.core import n8n_client
from app.core.auth import CurrentStaff, allowed_branch_ids, assert_branch_access, get_current_staff, require_permission
from app.core.config import Settings, get_settings
from app.core.database import get_supabase
from app.core.security import decrypt_secret, encrypt_secret
from app.models.schemas import (
    Channel,
    ChannelCreate,
    ChannelHealthCheck,
    ChannelSettings,
    ChannelSettingsUpdate,
    ChannelUpdate,
    Message,
    RotateCredentialsRequest,
    RoutingRule,
    RoutingRuleCreate,
    TestMessageRequest,
    TestMessageResult,
    VerifyCredentialsRequest,
    VerifyCredentialsResult,
)
from app.services.channel_providers import (
    PROVIDER_TYPES,
    mask_credentials,
    run_health_check,
    send_test_message,
    verify_credentials,
)

router = APIRouter(prefix="/channels", tags=["channels"])
logger = logging.getLogger("channels")

# One shared, already-published n8n workflow per provider type — each looks
# up the right channel dynamically by identifier and fetches its decrypted
# token per-message (see GET /channels?identifier= service-token path), so
# every branch's channel of that type is served without cloning anything.
# Telegram is the one exception: bot tokens can't share a webhook, so it
# still clones a dedicated workflow per channel (see the telegram branch
# below).
SHARED_N8N_WORKFLOWS: dict[str, tuple[str, str]] = {
    "whatsapp": ("epezsHMsWNQBJTiL", "whatsapp-outbound-send"),
    "instagram": ("Mq69unS6cMOOQcv8", "instagram-outbound-send"),
    "messenger": ("Jcb1kYGsL24bSbAx", "messenger-outbound-send"),
    "twilio": ("BUhTP52Fj0o8Qc4m", "twilio-outbound-send"),
}


def _channel_branch_id(db: Client, channel_id: str) -> str:
    rows = db.table("channels").select("branch_id").eq("id", channel_id).is_("deleted_at", "null").limit(1).execute().data
    if not rows:
        raise HTTPException(status_code=404, detail="القناة غير موجودة")
    return rows[0]["branch_id"]


def _to_channel_model(row: dict) -> Channel:
    creds = {}
    if row.get("credentials_encrypted"):
        try:
            creds = json.loads(decrypt_secret(row["credentials_encrypted"]))
        except Exception:
            creds = {}
    return Channel(
        id=row["id"],
        branch_id=row["branch_id"],
        channel_type=row["channel_type"],
        display_name=row["display_name"],
        identifier=row["identifier"],
        is_active=row["is_active"],
        token_expires_at=row.get("token_expires_at"),
        masked_credentials=mask_credentials(row["channel_type"], creds),
        created_at=row["created_at"],
    )


@router.get("")
def list_channels(
    branch_id: str | None = None,
    identifier: str | None = None,
    authorization: str | None = Header(default=None),
    x_service_token: str | None = Header(default=None),
    db: Client = Depends(get_supabase),
):
    """Two callers hit this endpoint: staff browsing the Channels dashboard
    (JWT, full RBAC + branch scoping, returns the n8n-free Channel shape
    below) and n8n resolving an inbound identifier to its channel record
    (service token, returns the raw internal row exactly as before — n8n
    genuinely needs outbound_webhook_url, staff never see it)."""
    settings = get_settings()
    is_service_call = bool(settings.service_token) and x_service_token == settings.service_token
    if is_service_call and identifier:
        rows = db.table("channels").select("*").eq("identifier", identifier).is_("deleted_at", "null").execute().data
        # n8n's shared per-provider-type workflows (WhatsApp/Instagram/Messenger)
        # serve every branch's channel from one workflow, so they need the real
        # per-channel token at send time — decrypted here, only on this
        # service-token path, never on the staff-facing shape above.
        for row in rows:
            row["credentials"] = {}
            if row.get("credentials_encrypted"):
                try:
                    row["credentials"] = json.loads(decrypt_secret(row["credentials_encrypted"]))
                except Exception:
                    row["credentials"] = {}
        return rows

    current = get_current_staff(authorization=authorization, db=db)
    if not current.has_permission("channel.view"):
        raise HTTPException(status_code=403, detail="ليست لديك صلاحية لهذا الإجراء")

    query = db.table("channels").select("*").is_("deleted_at", "null")
    if branch_id:
        assert_branch_access(current, "channel.view", branch_id)
        query = query.eq("branch_id", branch_id)
    else:
        allowed = allowed_branch_ids(current, "channel.view")
        if allowed is not None:
            if not allowed:
                return []
            query = query.in_("branch_id", allowed)
    if identifier:
        query = query.eq("identifier", identifier)
    rows = query.execute().data
    return [_to_channel_model(row) for row in rows]


@router.get("/provider-types")
def list_provider_types(_current: CurrentStaff = Depends(require_permission("channel.view"))):
    return PROVIDER_TYPES


@router.post("/verify-credentials", response_model=VerifyCredentialsResult)
def verify_channel_credentials(
    payload: VerifyCredentialsRequest, _current: CurrentStaff = Depends(require_permission("channel.create"))
):
    result = verify_credentials(payload.channel_type, payload.credentials)
    return VerifyCredentialsResult(valid=result.valid, details=result.details, error=result.error)


@router.post("", response_model=Channel)
def create_channel(
    payload: ChannelCreate,
    current: CurrentStaff = Depends(require_permission("channel.create")),
    db: Client = Depends(get_supabase),
    settings: Settings = Depends(get_settings),
):
    assert_branch_access(current, "channel.create", str(payload.branch_id))

    result = verify_credentials(payload.channel_type, payload.credentials)
    if not result.valid:
        raise HTTPException(status_code=400, detail=result.error or "فشل التحقق من بيانات الاتصال")

    # identifier must be the value n8n's inbound webhook payload can actually
    # match against for a live lookup, NOT necessarily the friendliest label
    # (that's what display_name is for) — e.g. WhatsApp/Instagram/Messenger
    # webhooks carry phone_number_id/ig_business_account_id/page_id, never
    # the display phone number, IG username, or page name.
    identifier_by_type = {
        "telegram": result.details.get("bot_username"),
        "whatsapp": payload.credentials.get("phone_number_id"),
        "instagram": payload.credentials.get("ig_business_account_id"),
        "messenger": payload.credentials.get("page_id"),
        "twilio": payload.credentials.get("from_number"),
    }
    identifier = identifier_by_type.get(payload.channel_type) or payload.display_name

    stored_credentials = dict(payload.credentials)
    if payload.channel_type == "web":
        # The public key is generated during verification itself (there are no
        # externally-issued credentials for a website widget) — persist it or
        # it's lost the moment this request ends.
        stored_credentials["public_key"] = result.details.get("public_key")

    row = {
        "branch_id": str(payload.branch_id),
        "channel_type": payload.channel_type,
        "display_name": payload.display_name,
        "identifier": identifier,
        "credentials_encrypted": encrypt_secret(json.dumps(stored_credentials)),
    }
    channel = db.table("channels").insert(row).execute().data[0]
    db.table("channel_settings").insert({"channel_id": channel["id"]}).execute()

    if (
        payload.channel_type == "telegram"
        and settings.n8n_rest_api_key
        and settings.n8n_telegram_template_workflow_id
        and settings.n8n_api_base_url
    ):
        try:
            credential_id = n8n_client.create_telegram_credential(f"Telegram - {payload.display_name}", payload.credentials["bot_token"])
            created_wf = n8n_client.clone_telegram_workflow(
                settings.n8n_telegram_template_workflow_id,
                name=f"Clinic Telegram Bot - {payload.display_name}",
                credential_id=credential_id,
                credential_name=f"Telegram - {payload.display_name}",
                channel_id=channel["id"],
            )
            n8n_client.activate_workflow(created_wf["id"])
            n8n_web_base = settings.n8n_api_base_url.removesuffix("/api/v1")
            outbound_webhook_url = f"{n8n_web_base}/webhook/{created_wf['_outbound_path']}"
            channel = (
                db.table("channels")
                .update({"n8n_workflow_id": created_wf["id"], "outbound_webhook_url": outbound_webhook_url, "is_active": True})
                .eq("id", channel["id"])
                .execute()
                .data[0]
            )
        except Exception:
            # Credentials are verified and saved either way — the clinic can
            # retry activation later; we don't lose the configured channel.
            pass

    elif payload.channel_type in SHARED_N8N_WORKFLOWS and settings.n8n_api_base_url:
        # These provider types don't clone a workflow per channel — ONE
        # shared workflow per type looks up the right channel dynamically by
        # identifier and fetches its decrypted token per-message, so adding a
        # channel here only means pointing it at that already-published
        # workflow's outbound webhook. Nothing to create in n8n at all.
        #
        # Guarded on n8n_api_base_url being configured: without it this built
        # a relative "/webhook/..." and still flipped is_active=True, so the
        # channel looked live in the dashboard while every outbound send
        # (staff replies, reminders) failed against an unusable URL.
        workflow_id, outbound_path = SHARED_N8N_WORKFLOWS[payload.channel_type]
        n8n_web_base = settings.n8n_api_base_url.removesuffix("/api/v1")
        channel = (
            db.table("channels")
            .update(
                {
                    "n8n_workflow_id": workflow_id,
                    "outbound_webhook_url": f"{n8n_web_base}/webhook/{outbound_path}",
                    "is_active": True,
                }
            )
            .eq("id", channel["id"])
            .execute()
            .data[0]
        )

    db.table("audit_log").insert(
        {
            "entity_type": "channel",
            "entity_id": channel["id"],
            "action": "create",
            "new_value": {"display_name": payload.display_name, "channel_type": payload.channel_type},
            "user_id": current.id,
        }
    ).execute()

    return _to_channel_model(channel)


@router.get("/{channel_id}", response_model=Channel)
def get_channel(
    channel_id: UUID, current: CurrentStaff = Depends(require_permission("channel.view")), db: Client = Depends(get_supabase)
):
    assert_branch_access(current, "channel.view", _channel_branch_id(db, str(channel_id)))
    row = db.table("channels").select("*").eq("id", str(channel_id)).is_("deleted_at", "null").single().execute().data
    return _to_channel_model(row)


@router.patch("/{channel_id}", response_model=Channel)
def update_channel(
    channel_id: UUID,
    payload: ChannelUpdate,
    current: CurrentStaff = Depends(require_permission("channel.update")),
    db: Client = Depends(get_supabase),
):
    assert_branch_access(current, "channel.update", _channel_branch_id(db, str(channel_id)))
    updates = payload.model_dump(exclude_unset=True, mode="json")
    updated = db.table("channels").update(updates).eq("id", str(channel_id)).execute().data[0]
    db.table("audit_log").insert(
        {"entity_type": "channel", "entity_id": str(channel_id), "action": "update", "new_value": updates, "user_id": current.id}
    ).execute()
    return _to_channel_model(updated)


@router.delete("/{channel_id}")
def delete_channel(
    channel_id: UUID, current: CurrentStaff = Depends(require_permission("channel.delete")), db: Client = Depends(get_supabase)
):
    assert_branch_access(current, "channel.delete", _channel_branch_id(db, str(channel_id)))
    row = db.table("channels").select("n8n_workflow_id").eq("id", str(channel_id)).limit(1).execute().data
    if row and row[0].get("n8n_workflow_id"):
        try:
            n8n_client.deactivate_workflow(row[0]["n8n_workflow_id"])
        except Exception:
            # /conversations/inbound also rejects deleted_at channels, so the
            # bot still stops even if this call failed — but log it, since a
            # workflow silently left active is exactly how a "deleted" channel
            # kept looking live everywhere except the dashboard.
            logger.exception("failed to deactivate n8n workflow %s for deleted channel %s", row[0]["n8n_workflow_id"], channel_id)
    db.table("channels").update(
        {"is_active": False, "deleted_at": datetime.now(timezone.utc).isoformat()}
    ).eq("id", str(channel_id)).execute()
    db.table("audit_log").insert(
        {"entity_type": "channel", "entity_id": str(channel_id), "action": "delete", "user_id": current.id}
    ).execute()
    return {"deleted": True}


@router.post("/{channel_id}/rotate-credentials", response_model=Channel)
def rotate_credentials(
    channel_id: UUID,
    payload: RotateCredentialsRequest,
    current: CurrentStaff = Depends(require_permission("channel.update")),
    db: Client = Depends(get_supabase),
):
    """Replaces the stored credentials for an existing channel — same channel
    row, same conversations, just a new token. This is the path clinics will
    use often since Meta tokens expire."""
    channel = db.table("channels").select("channel_type").eq("id", str(channel_id)).is_("deleted_at", "null").limit(1).execute().data
    if not channel:
        raise HTTPException(status_code=404, detail="القناة غير موجودة")
    assert_branch_access(current, "channel.update", _channel_branch_id(db, str(channel_id)))

    result = verify_credentials(channel[0]["channel_type"], payload.credentials)
    if not result.valid:
        raise HTTPException(status_code=400, detail=result.error or "فشل التحقق من بيانات الاتصال الجديدة")

    updated = (
        db.table("channels")
        .update({"credentials_encrypted": encrypt_secret(json.dumps(payload.credentials))})
        .eq("id", str(channel_id))
        .execute()
        .data[0]
    )
    db.table("audit_log").insert(
        {"entity_type": "channel", "entity_id": str(channel_id), "action": "rotate_credentials", "user_id": current.id}
    ).execute()
    return _to_channel_model(updated)


@router.post("/{channel_id}/test-message", response_model=TestMessageResult)
def send_channel_test_message(
    channel_id: UUID,
    payload: TestMessageRequest,
    current: CurrentStaff = Depends(require_permission("channel.view")),
    db: Client = Depends(get_supabase),
):
    """Sends one real message directly to the platform (not through n8n) so
    staff can confirm a channel truly delivers before relying on it."""
    assert_branch_access(current, "channel.view", _channel_branch_id(db, str(channel_id)))
    channel = db.table("channels").select("channel_type, credentials_encrypted").eq("id", str(channel_id)).single().execute().data
    creds = {}
    if channel.get("credentials_encrypted"):
        try:
            creds = json.loads(decrypt_secret(channel["credentials_encrypted"]))
        except Exception:
            creds = {}
    result = send_test_message(channel["channel_type"], creds, payload.recipient, payload.message)
    return TestMessageResult(sent=result.valid, error=result.error)


@router.get("/{channel_id}/health", response_model=ChannelHealthCheck)
def get_channel_health(
    channel_id: UUID, current: CurrentStaff = Depends(require_permission("channel.view")), db: Client = Depends(get_supabase)
):
    assert_branch_access(current, "channel.view", _channel_branch_id(db, str(channel_id)))
    rows = (
        db.table("channel_health_checks")
        .select("*")
        .eq("channel_id", str(channel_id))
        .order("checked_at", desc=True)
        .limit(1)
        .execute()
        .data
    )
    if not rows:
        channel = db.table("channels").select("*").eq("id", str(channel_id)).single().execute().data
        return run_health_check(db, channel)
    return rows[0]


@router.post("/{channel_id}/health/check", response_model=ChannelHealthCheck)
def check_channel_health_now(
    channel_id: UUID, current: CurrentStaff = Depends(require_permission("channel.view")), db: Client = Depends(get_supabase)
):
    assert_branch_access(current, "channel.view", _channel_branch_id(db, str(channel_id)))
    channel = db.table("channels").select("*").eq("id", str(channel_id)).single().execute().data
    return run_health_check(db, channel)


@router.get("/{channel_id}/messages/recent", response_model=list[Message])
def recent_channel_messages(
    channel_id: UUID, current: CurrentStaff = Depends(require_permission("channel.view")), db: Client = Depends(get_supabase)
):
    assert_branch_access(current, "channel.view", _channel_branch_id(db, str(channel_id)))
    conv_ids = [r["id"] for r in db.table("conversations").select("id").eq("channel_id", str(channel_id)).execute().data]
    if not conv_ids:
        return []
    return (
        db.table("messages")
        .select("id, conversation_id, direction, sender_type, content, created_at")
        .in_("conversation_id", conv_ids)
        .order("created_at", desc=True)
        .limit(20)
        .execute()
        .data
    )


@router.get("/{channel_id}/settings", response_model=ChannelSettings)
def get_channel_settings(
    channel_id: UUID, current: CurrentStaff = Depends(require_permission("channel.view")), db: Client = Depends(get_supabase)
):
    assert_branch_access(current, "channel.view", _channel_branch_id(db, str(channel_id)))
    rows = db.table("channel_settings").select("*").eq("channel_id", str(channel_id)).limit(1).execute().data
    if rows:
        return rows[0]
    # Channels created before this table existed (or any other gap) get a
    # default row lazily instead of 500ing the settings tab.
    return db.table("channel_settings").insert({"channel_id": str(channel_id)}).execute().data[0]


@router.patch("/{channel_id}/settings", response_model=ChannelSettings)
def update_channel_settings(
    channel_id: UUID,
    payload: ChannelSettingsUpdate,
    current: CurrentStaff = Depends(require_permission("channel.update")),
    db: Client = Depends(get_supabase),
):
    assert_branch_access(current, "channel.update", _channel_branch_id(db, str(channel_id)))
    updates = payload.model_dump(exclude_unset=True, mode="json")
    updates["updated_by"] = current.id
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    return db.table("channel_settings").update(updates).eq("channel_id", str(channel_id)).execute().data[0]


@router.get("/{channel_id}/routing-rules", response_model=list[RoutingRule])
def list_routing_rules(
    channel_id: UUID, current: CurrentStaff = Depends(require_permission("channel.view")), db: Client = Depends(get_supabase)
):
    assert_branch_access(current, "channel.view", _channel_branch_id(db, str(channel_id)))
    return (
        db.table("channel_routing_rules")
        .select("*")
        .eq("channel_id", str(channel_id))
        .order("priority", desc=True)
        .execute()
        .data
    )


@router.post("/{channel_id}/routing-rules", response_model=RoutingRule)
def create_routing_rule(
    channel_id: UUID,
    payload: RoutingRuleCreate,
    current: CurrentStaff = Depends(require_permission("channel.update")),
    db: Client = Depends(get_supabase),
):
    assert_branch_access(current, "channel.update", _channel_branch_id(db, str(channel_id)))
    data = payload.model_dump(mode="json")
    data["channel_id"] = str(channel_id)
    return db.table("channel_routing_rules").insert(data).execute().data[0]


@router.delete("/{channel_id}/routing-rules/{rule_id}")
def delete_routing_rule(
    channel_id: UUID,
    rule_id: UUID,
    current: CurrentStaff = Depends(require_permission("channel.update")),
    db: Client = Depends(get_supabase),
):
    assert_branch_access(current, "channel.update", _channel_branch_id(db, str(channel_id)))
    db.table("channel_routing_rules").delete().eq("id", str(rule_id)).eq("channel_id", str(channel_id)).execute()
    return {"deleted": True}
