import re
import secrets
from datetime import datetime, timedelta, timezone

from supabase import Client

from app.services.text_match import digits_only, to_ascii_digits

_CODE_LENGTH = 4
_EXPIRY = timedelta(minutes=10)
_MAX_ATTEMPTS = 5
# How long a *verified* code still counts as "this booking attempt" --
# book_appointment's gate checks this, not just whether verify_booking_otp
# was ever called. Wide enough to cover a slot turning out unavailable and
# the patient picking a nearby alternative without re-verifying, narrow
# enough that a verification from an abandoned booking attempt a while ago
# can't wave through an unrelated one later in the same conversation.
_VERIFIED_WINDOW = timedelta(minutes=15)


class OtpError(Exception):
    """Always a patient-facing reason (wrong code, expired, too many
    attempts, ...), never an unexpected failure -- those propagate as
    themselves, same as every other tool in this module family."""


def generate_booking_otp(db: Client, conversation_id: str) -> str:
    """A fresh numeric code for this conversation. Nothing explicitly
    invalidates the previous row -- verify_booking_otp and
    has_verified_booking_otp both only ever look at the most recently
    created row for a conversation, so an earlier code simply stops being
    reachable the moment a new one exists."""
    code = "".join(secrets.choice("0123456789") for _ in range(_CODE_LENGTH))
    now = datetime.now(timezone.utc)
    db.table("chat_booking_otp").insert(
        {
            "conversation_id": conversation_id,
            "code": code,
            "expires_at": (now + _EXPIRY).isoformat(),
        }
    ).execute()
    return code


def _latest_otp_row(db: Client, conversation_id: str) -> dict | None:
    rows = (
        db.table("chat_booking_otp")
        .select("id, code, attempts, consumed_at, expires_at")
        .eq("conversation_id", conversation_id)
        .order("created_at", desc=True)
        .limit(1)
        .execute()
        .data
    )
    return rows[0] if rows else None


def verify_booking_otp(db: Client, conversation_id: str, submitted_code: str) -> None:
    """Raises OtpError with a patient-facing reason if the code doesn't
    check out; otherwise marks the most recent code for this conversation as
    consumed."""
    row = _latest_otp_row(db, conversation_id)
    if not row:
        raise OtpError("ما في كود مُرسل أصلاً لهذا المريض بعد — استدعي send_confirmation_code أولاً.")
    if row.get("consumed_at"):
        raise OtpError("هذا الكود انستخدم قبل هيك — استدعي send_confirmation_code لكود جديد إذا لسا بدك تحجزي.")
    if row["attempts"] >= _MAX_ATTEMPTS:
        raise OtpError("تم تجاوز عدد المحاولات المسموح لهذا الكود — استدعي send_confirmation_code لكود جديد.")
    expires_at = datetime.fromisoformat(row["expires_at"].replace("Z", "+00:00"))
    if datetime.now(timezone.utc) > expires_at:
        raise OtpError("انتهت صلاحية الكود — استدعي send_confirmation_code لكود جديد.")

    if digits_only(submitted_code) != row["code"]:
        new_attempts = row["attempts"] + 1
        db.table("chat_booking_otp").update({"attempts": new_attempts}).eq("id", row["id"]).execute()
        remaining = _MAX_ATTEMPTS - new_attempts
        if remaining > 0:
            raise OtpError(f"الكود غلط. باقي {remaining} محاولة.")
        raise OtpError("الكود غلط، وخلصت المحاولات المسموحة — استدعي send_confirmation_code لكود جديد.")

    db.table("chat_booking_otp").update(
        {"consumed_at": datetime.now(timezone.utc).isoformat()}
    ).eq("id", row["id"]).execute()


def latest_unconsumed_otp(db: Client, conversation_id: str) -> dict | None:
    """The most recent OTP row for this conversation, only if it's still
    awaiting a verification attempt -- None once it's been consumed (a
    successful verification already happened on it) or if no code was ever
    sent.

    Used to check a bare-digits reply against the real code deterministically
    (see generate_reply in chat.py), rather than only ever relying on the
    model to reliably call verify_confirmation_code itself. Confirmed live:
    a patient replied the exact code the bot had just sent, three times in a
    row, and the bot claimed each one was wrong or expired and sent a new
    one every time without the patient ever getting verified -- consistent
    with the model's tool-calling turn (particularly on the Gemini fallback
    path, which chat.py's own history notes as unreliable specifically on
    tool-calling turns) sometimes never actually invoking
    verify_confirmation_code at all, and instead free-narrating a plausible-
    sounding rejection."""
    row = _latest_otp_row(db, conversation_id)
    if row is None or row.get("consumed_at"):
        return None
    return row


_BARE_CODE_RE = re.compile(r"^\d{3,6}$")


def looks_like_a_bare_otp_reply(message: str | None) -> bool:
    """True when the patient's entire message is just a short number and
    nothing else -- the shape of a code typed back in reply to
    send_confirmation_code, not one that merely appears inside a longer
    sentence (which the model should keep interpreting normally)."""
    if not message:
        return False
    stripped = to_ascii_digits(message).strip()
    return bool(_BARE_CODE_RE.fullmatch(stripped))


def has_verified_booking_otp(db: Client, conversation_id: str) -> bool:
    """The server-side gate book_appointment actually checks -- enforced
    here, not just requested in the prompt, the same reason
    missing_contact_fields blocks book_appointment in booking.py rather than
    only being asked for in BASE_INSTRUCTIONS: a model that skips or forgets
    an instruction still cannot make this tool succeed."""
    row = _latest_otp_row(db, conversation_id)
    if not row or not row.get("consumed_at"):
        return False
    consumed_at = datetime.fromisoformat(row["consumed_at"].replace("Z", "+00:00"))
    return datetime.now(timezone.utc) - consumed_at <= _VERIFIED_WINDOW
