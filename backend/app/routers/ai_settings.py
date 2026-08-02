from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from supabase import Client

from app.core.auth import CurrentStaff, require_permission
from app.core.database import get_supabase
from app.core.security import decrypt_secret, encrypt_secret
from app.models.schemas import AiProviderSettings, AiProviderSettingsUpdate

router = APIRouter(prefix="/settings/ai-providers", tags=["settings"])


def _mask(encrypted_value: str | None) -> str | None:
    """Never let a raw key reach the frontend — show only enough to
    recognize which one is configured (e.g. '****a4f2')."""
    if not encrypted_value:
        return None
    value = decrypt_secret(encrypted_value)
    return f"****{value[-4:]}" if len(value) >= 4 else "****"


def _row_to_response(row: dict) -> AiProviderSettings:
    return AiProviderSettings(
        id=row["id"],
        openai_api_key_masked=_mask(row.get("openai_api_key_encrypted")),
        gemini_api_key_masked=_mask(row.get("gemini_api_key_encrypted")),
        gemini_model=row.get("gemini_model"),
        updated_at=row["updated_at"],
    )


@router.get("", response_model=AiProviderSettings)
def get_ai_provider_settings(
    _current: CurrentStaff = Depends(require_permission("ai_settings.view")), db: Client = Depends(get_supabase)
):
    row = db.table("ai_provider_settings").select("*").limit(1).single().execute().data
    return _row_to_response(row)


@router.patch("", response_model=AiProviderSettings)
def update_ai_provider_settings(
    payload: AiProviderSettingsUpdate,
    current: CurrentStaff = Depends(require_permission("ai_settings.update")),
    db: Client = Depends(get_supabase),
):
    existing = db.table("ai_provider_settings").select("id").limit(1).single().execute().data
    fields = payload.model_dump(exclude_unset=True)

    updates: dict = {}
    if "openai_api_key" in fields:
        updates["openai_api_key_encrypted"] = encrypt_secret(fields["openai_api_key"]) if fields["openai_api_key"] else None
    if "gemini_api_key" in fields:
        updates["gemini_api_key_encrypted"] = encrypt_secret(fields["gemini_api_key"]) if fields["gemini_api_key"] else None
    if "gemini_model" in fields:
        updates["gemini_model"] = fields["gemini_model"] or None

    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    updates["updated_by"] = current.id
    row = db.table("ai_provider_settings").update(updates).eq("id", existing["id"]).execute().data[0]
    return _row_to_response(row)
