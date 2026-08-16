from datetime import datetime, timedelta, timezone

from supabase import Client

# Mirrors backend/app/services/payments.py's _RECEIPT_MATCH_WINDOW: how long
# after being asked for a receipt a photo still plausibly answers that ask.
# Kept as a second copy on purpose rather than a shared import — ai-services
# and backend are deployed separately and don't share a package today, and
# this rule is small and stable enough that duplicating it beats coupling the
# two services' deploys together over one constant.
_RECEIPT_MATCH_WINDOW = timedelta(hours=72)


def _parse_timestamp(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def find_pending_receipt_payment(db: Client, patient_id: str) -> str | None:
    """The id of this patient's most recent payment still waiting on a
    receipt (pending, or rejected and being retried), or None if there isn't
    one or it's too stale to plausibly be what an inbound photo answers.

    backend's attach_receipt_from_inbound_media used to run this same check
    unconditionally for every inbound photo, regardless of whether an AI
    turn was about to run — which meant it decided "this is a receipt" from
    timing alone, with no look at what the photo actually shows (confirmed
    live: a patient's photo of an injured hand got auto-matched to a stale
    pending payment and replied to as if it were a receipt). The backend now
    only auto-attaches for mode=human conversations; for mode=ai, the AI
    calls submit_payment_receipt (chat.py) after Gemini vision has already
    told it the photo isn't medical/cosmetic, and that tool uses this same
    matching rule so a receipt still only attaches to a payment it was
    plausibly sent for.
    """
    rows = (
        db.table("payments")
        .select("id, status, payment_instructions_sent_at, verified_at")
        .eq("patient_id", patient_id)
        .in_("status", ["pending", "rejected"])
        .order("created_at", desc=True)
        .limit(1)
        .execute()
        .data
    )
    if not rows:
        return None
    payment = rows[0]
    # A "pending" payment was asked for via payment_instructions_sent_at; a
    # "rejected" one via verified_at, the moment staff rejected it and asked
    # for a resend (reject_payment reuses verified_at for both outcomes).
    asked_at = payment.get("payment_instructions_sent_at") if payment["status"] == "pending" else payment.get("verified_at")
    if not asked_at or _parse_timestamp(asked_at) < datetime.now(timezone.utc) - _RECEIPT_MATCH_WINDOW:
        return None
    return payment["id"]


def attach_receipt(db: Client, payment_id: str, receipt_image_url: str) -> None:
    """Marks a payment's receipt as submitted. Unlike backend's
    submit_receipt, this never sends its own delivery message — the AI is
    already composing this turn's reply and tells the patient in its own
    words, so a second, separate "we received your receipt" message would
    just be a duplicate."""
    db.table("payments").update(
        {
            "status": "receipt_submitted",
            "receipt_image_url": receipt_image_url,
            "submitted_at": datetime.now(timezone.utc).isoformat(),
        }
    ).eq("id", payment_id).execute()
