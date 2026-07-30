import secrets
from datetime import datetime, timedelta, timezone

import httpx
from supabase import Client

from app.core.security import decrypt_secret

# Per-provider required credential fields — drives both the add-channel form
# contract and server-side validation before anything gets saved.
REQUIRED_FIELDS: dict[str, list[str]] = {
    "telegram": ["bot_token"],
    "whatsapp": ["phone_number_id", "waba_id", "access_token"],
    "twilio": ["account_sid", "auth_token", "from_number"],
    "instagram": ["page_access_token", "ig_business_account_id"],
    "messenger": ["page_id", "page_access_token"],
    "web": [],
}

PROVIDER_TYPES = list(REQUIRED_FIELDS.keys())


class CredentialCheckResult:
    def __init__(self, valid: bool, details: dict | None = None, error: str | None = None):
        self.valid = valid
        self.details = details or {}
        self.error = error


def _missing_fields(provider_type: str, credentials: dict) -> list[str]:
    return [f for f in REQUIRED_FIELDS.get(provider_type, []) if not credentials.get(f)]


def verify_credentials(provider_type: str, credentials: dict) -> CredentialCheckResult:
    """Makes a real call to the platform to confirm these credentials
    actually work — nothing gets saved based on client-side validation alone."""
    if provider_type not in REQUIRED_FIELDS:
        return CredentialCheckResult(False, error=f"نوع قناة غير مدعوم: {provider_type}")

    missing = _missing_fields(provider_type, credentials)
    if missing:
        return CredentialCheckResult(False, error=f"حقول ناقصة: {', '.join(missing)}")

    try:
        if provider_type == "telegram":
            r = httpx.get(f"https://api.telegram.org/bot{credentials['bot_token']}/getMe", timeout=10)
            body = r.json()
            if not body.get("ok"):
                return CredentialCheckResult(False, error="توكن البوت غير صحيح — تأكد من نسخه كاملاً من BotFather")
            return CredentialCheckResult(True, details={"bot_username": body["result"]["username"]})

        if provider_type == "whatsapp":
            r = httpx.get(
                f"https://graph.facebook.com/v20.0/{credentials['phone_number_id']}",
                params={"access_token": credentials["access_token"], "fields": "display_phone_number,verified_name"},
                timeout=10,
            )
            body = r.json()
            if "error" in body:
                return CredentialCheckResult(False, error=f"فشل التحقق من واتساب: {body['error'].get('message', 'غير معروف')}")
            return CredentialCheckResult(True, details={"phone_number": body.get("display_phone_number"), "verified_name": body.get("verified_name")})

        if provider_type == "twilio":
            r = httpx.get(
                f"https://api.twilio.com/2010-04-01/Accounts/{credentials['account_sid']}.json",
                auth=(credentials["account_sid"], credentials["auth_token"]),
                timeout=10,
            )
            if r.status_code != 200:
                return CredentialCheckResult(False, error="فشل التحقق من Twilio — تأكد من Account SID وAuth Token")
            body = r.json()
            return CredentialCheckResult(True, details={"account_name": body.get("friendly_name")})

        if provider_type == "instagram":
            r = httpx.get(
                f"https://graph.facebook.com/v20.0/{credentials['ig_business_account_id']}",
                params={"access_token": credentials["page_access_token"], "fields": "username"},
                timeout=10,
            )
            body = r.json()
            if "error" in body:
                return CredentialCheckResult(False, error=f"فشل التحقق من انستقرام: {body['error'].get('message', 'غير معروف')}")
            return CredentialCheckResult(True, details={"username": body.get("username")})

        if provider_type == "messenger":
            r = httpx.get(
                f"https://graph.facebook.com/v20.0/{credentials['page_id']}",
                params={"access_token": credentials["page_access_token"], "fields": "name"},
                timeout=10,
            )
            body = r.json()
            if "error" in body:
                return CredentialCheckResult(False, error=f"فشل التحقق من ماسنجر: {body['error'].get('message', 'غير معروف')}")
            return CredentialCheckResult(True, details={"page_name": body.get("name")})

        if provider_type == "web":
            return CredentialCheckResult(True, details={"public_key": f"pk_{secrets.token_urlsafe(24)}"})

    except httpx.HTTPError as exc:
        return CredentialCheckResult(False, error=f"تعذر الاتصال بالمنصة: {exc}")

    return CredentialCheckResult(False, error="نوع قناة غير مدعوم")


def run_health_check(db: Client, channel: dict) -> dict:
    """Re-verifies the stored credentials against the real platform right
    now, checks how recently a message actually moved on this channel, and
    persists the result so the channels list can show a status at a glance
    instead of everyone assuming 'active in n8n' means 'actually working'."""
    import json

    status = "not_connected"
    token_valid = None
    error_code = None
    error_message = None

    if channel.get("credentials_encrypted"):
        try:
            creds = json.loads(decrypt_secret(channel["credentials_encrypted"]))
        except Exception:
            creds = {}
        result = verify_credentials(channel["channel_type"], creds)
        token_valid = result.valid
        if not result.valid:
            status = "failed"
            error_code = "invalid_credentials"
            error_message = result.error
        else:
            status = "healthy" if channel.get("n8n_workflow_id") and channel.get("is_active") else "degraded"
            if status == "degraded":
                error_message = "بيانات الاتصال صحيحة لكن القناة غير مفعّلة أو مسار الاستقبال غير مكتمل"
    elif REQUIRED_FIELDS.get(channel["channel_type"]):
        # Channels created before credential storage existed (or any channel
        # whose token was never entered) — distinct from "never activated".
        error_code = "no_credentials"
        error_message = "لا توجد بيانات اتصال محفوظة لهذه القناة — أضفها من تبويب الاتصال لتفعيل فحص الحالة"

    expires_at = channel.get("token_expires_at")
    if expires_at:
        expires = datetime.fromisoformat(expires_at)
        now = datetime.now(timezone.utc)
        if expires < now:
            status, error_code, error_message = "failed", "token_expired", "التوكن منتهي — حدّثه من إعدادات القناة"
        elif expires < now + timedelta(days=5):
            status = "degraded" if status == "healthy" else status
            error_code, error_message = "token_expiring_soon", f"التوكن سينتهي قريباً ({expires.date()}) — حدّثه من الإعدادات"

    last_in = (
        db.table("messages")
        .select("created_at, conversations!inner(channel_id)")
        .eq("conversations.channel_id", channel["id"])
        .eq("direction", "inbound")
        .order("created_at", desc=True)
        .limit(1)
        .execute()
        .data
    )
    last_out = (
        db.table("messages")
        .select("created_at, conversations!inner(channel_id)")
        .eq("conversations.channel_id", channel["id"])
        .eq("direction", "outbound")
        .order("created_at", desc=True)
        .limit(1)
        .execute()
        .data
    )

    row = {
        "channel_id": channel["id"],
        "status": status,
        "token_valid": token_valid,
        "webhook_registered": bool(channel.get("n8n_workflow_id")) if token_valid else None,
        "last_inbound_at": last_in[0]["created_at"] if last_in else None,
        "last_outbound_at": last_out[0]["created_at"] if last_out else None,
        "error_code": error_code,
        "error_message": error_message,
    }
    return db.table("channel_health_checks").insert(row).execute().data[0]


def send_test_message(provider_type: str, credentials: dict, recipient: str, text: str) -> CredentialCheckResult:
    """Sends one real message straight to the platform (bypassing n8n entirely)
    so an owner can confirm a channel actually delivers before trusting it with
    real patients."""
    if provider_type == "web":
        return CredentialCheckResult(False, error="قناة الموقع لا تُختبر بهذه الطريقة — جرّب أداة الدردشة على موقعك مباشرة")

    missing = _missing_fields(provider_type, credentials)
    if missing:
        return CredentialCheckResult(False, error=f"حقول ناقصة: {', '.join(missing)}")

    try:
        if provider_type == "telegram":
            r = httpx.post(
                f"https://api.telegram.org/bot{credentials['bot_token']}/sendMessage",
                json={"chat_id": recipient, "text": text},
                timeout=10,
            )
            body = r.json()
            if not body.get("ok"):
                return CredentialCheckResult(False, error=f"فشل الإرسال: {body.get('description', 'غير معروف')}")
            return CredentialCheckResult(True)

        if provider_type == "whatsapp":
            r = httpx.post(
                f"https://graph.facebook.com/v20.0/{credentials['phone_number_id']}/messages",
                headers={"Authorization": f"Bearer {credentials['access_token']}"},
                json={"messaging_product": "whatsapp", "to": recipient, "type": "text", "text": {"body": text}},
                timeout=10,
            )
            body = r.json()
            if "error" in body:
                return CredentialCheckResult(False, error=f"فشل الإرسال: {body['error'].get('message', 'غير معروف')}")
            return CredentialCheckResult(True)

        if provider_type == "twilio":
            r = httpx.post(
                f"https://api.twilio.com/2010-04-01/Accounts/{credentials['account_sid']}/Messages.json",
                auth=(credentials["account_sid"], credentials["auth_token"]),
                data={"From": credentials["from_number"], "To": recipient, "Body": text},
                timeout=10,
            )
            if r.status_code >= 300:
                return CredentialCheckResult(False, error=f"فشل الإرسال عبر Twilio: {r.json().get('message', 'غير معروف')}")
            return CredentialCheckResult(True)

        if provider_type in ("instagram", "messenger"):
            token = credentials.get("page_access_token")
            r = httpx.post(
                "https://graph.facebook.com/v20.0/me/messages",
                params={"access_token": token},
                json={"recipient": {"id": recipient}, "message": {"text": text}},
                timeout=10,
            )
            body = r.json()
            if "error" in body:
                return CredentialCheckResult(False, error=f"فشل الإرسال: {body['error'].get('message', 'غير معروف')}")
            return CredentialCheckResult(True)

    except httpx.HTTPError as exc:
        return CredentialCheckResult(False, error=f"تعذر الاتصال بالمنصة: {exc}")

    return CredentialCheckResult(False, error="نوع قناة غير مدعوم")


def mask_credentials(provider_type: str, credentials: dict) -> dict:
    """Never let a raw secret reach the frontend — show only enough to
    recognize which credential is configured (e.g. '****a4f2')."""
    masked = {}
    for key, value in credentials.items():
        if not isinstance(value, str) or len(value) < 4:
            masked[key] = "****"
        else:
            masked[key] = f"****{value[-4:]}"
    return masked
