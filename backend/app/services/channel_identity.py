from datetime import datetime, timezone

from supabase import Client

_LEGACY_TELEGRAM_PREFIX = "tg:"


def resolve_external_user_id(provider_type: str, patient_phone: str | None, external_user_id: str | None) -> str | None:
    """n8n's live Telegram workflows still send the legacy `patient_phone:
    "tg:{chat_id}"` shape — this is the one place that translates it into a
    real external_user_id so new code never has to know about that quirk."""
    if external_user_id:
        return external_user_id
    if not patient_phone:
        return None
    if provider_type == "telegram" and patient_phone.startswith(_LEGACY_TELEGRAM_PREFIX):
        return patient_phone.removeprefix(_LEGACY_TELEGRAM_PREFIX)
    return patient_phone


def is_real_phone(provider_type: str, patient_phone: str | None) -> bool:
    """A synthetic 'tg:12345' value is not an actual phone number a patient
    can be looked up or contacted by — never store or match on it as if it were one."""
    if not patient_phone:
        return False
    if provider_type == "telegram" and patient_phone.startswith(_LEGACY_TELEGRAM_PREFIX):
        return False
    return True


def resolve_identity(
    db: Client, channel_id: str, provider_type: str, external_user_id: str, display_name: str | None
) -> dict:
    """Finds or creates the patient_channel_identities row for this exact
    (channel, external_user_id) pair — the one stable key across however many
    times this same person messages this same channel."""
    rows = (
        db.table("patient_channel_identities")
        .select("*")
        .eq("channel_id", channel_id)
        .eq("external_user_id", external_user_id)
        .limit(1)
        .execute()
        .data
    )
    now = datetime.now(timezone.utc).isoformat()
    if rows:
        identity = rows[0]
        updates = {"last_seen_at": now}
        if display_name and display_name != identity.get("display_name"):
            updates["display_name"] = display_name
        db.table("patient_channel_identities").update(updates).eq("id", identity["id"]).execute()
        identity.update(updates)
        return identity

    return (
        db.table("patient_channel_identities")
        .insert(
            {
                "channel_id": channel_id,
                "provider_type": provider_type,
                "external_user_id": external_user_id,
                "display_name": display_name,
            }
        )
        .execute()
        .data[0]
    )


def link_patient_to_identity(db: Client, identity: dict, patient_id: str, phone_number: str | None = None) -> None:
    updates: dict = {"patient_id": patient_id}
    if phone_number:
        updates["phone_number"] = phone_number
    db.table("patient_channel_identities").update(updates).eq("id", identity["id"]).execute()
    identity.update(updates)


def find_or_create_patient_by_phone(db: Client, phone: str, display_name: str | None) -> str:
    rows = db.table("patients").select("id").eq("phone", phone).limit(1).execute().data
    if rows:
        return rows[0]["id"]
    return (
        db.table("patients")
        .insert({"full_name": display_name or phone, "phone": phone})
        .execute()
        .data[0]["id"]
    )
