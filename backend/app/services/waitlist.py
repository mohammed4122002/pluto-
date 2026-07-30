import logging
from datetime import datetime, timedelta, timezone

import httpx
from fastapi import HTTPException
from supabase import Client

from app.services.appointments import generate_appointment_number, generate_confirmation_code
from app.services.notifications import _resolve_channel_for_patient

logger = logging.getLogger(__name__)

OFFER_WINDOW_MINUTES = 30


def offer_slot_to_top_candidate(db: Client, slot_id: str) -> dict | None:
    """Called whenever a slot becomes available again (release/cancel/reschedule).
    Finds the best-matching active waitlist entry, reserves the slot for it, and
    sends a time-limited offer. Callers of decline/expire re-invoke this so the
    slot falls through to the next candidate — FR-WL-001..010."""
    slot_rows = db.table("slots").select("*").eq("id", slot_id).limit(1).execute().data
    if not slot_rows or slot_rows[0]["status"] != "available":
        return None
    slot = slot_rows[0]

    query = db.table("waitlist").select("*").eq("status", "active").eq("branch_id", slot["branch_id"])
    if slot.get("service_id"):
        query = query.or_(f"service_id.eq.{slot['service_id']},service_id.is.null")
    candidates = query.execute().data

    if slot.get("doctor_id"):
        candidates = [
            c for c in candidates
            if not c.get("doctor_id") or c["doctor_id"] == slot["doctor_id"] or c.get("accepts_alternative_doctor")
        ]

    if not candidates:
        return None

    candidates.sort(key=lambda c: (-c.get("medical_priority", 0), c["created_at"]))
    top = candidates[0]

    expires_at = (datetime.now(timezone.utc) + timedelta(minutes=OFFER_WINDOW_MINUTES)).isoformat()
    offer = (
        db.table("waitlist_offers")
        .insert({"waitlist_id": top["id"], "slot_id": slot_id, "expires_at": expires_at})
        .execute()
        .data[0]
    )
    db.table("waitlist").update({"status": "offered"}).eq("id", top["id"]).execute()
    db.table("slots").update({"status": "reserved"}).eq("id", slot_id).eq("status", "available").execute()

    _notify_offer(db, top, slot)
    return offer


def _notify_offer(db: Client, waitlist_entry: dict, slot: dict) -> None:
    try:
        channel = _resolve_channel_for_patient(db, waitlist_entry["patient_id"])
        if not channel or not channel.get("outbound_webhook_url"):
            return
        patient = db.table("patients").select("phone").eq("id", waitlist_entry["patient_id"]).limit(1).execute().data
        if not patient:
            return
        start = datetime.fromisoformat(slot["start_at"])
        message = (
            f"توفر موعد لك بتاريخ {start.strftime('%Y-%m-%d')} الساعة {start.strftime('%H:%M')}. "
            f"للتأكيد رد خلال {OFFER_WINDOW_MINUTES} دقيقة وإلا يُعرض على غيرك."
        )
        httpx.post(
            channel["outbound_webhook_url"],
            json={"recipient": patient[0]["phone"], "message": message, "channel_identifier": channel["identifier"]},
            timeout=10,
        )
    except Exception:
        logger.exception("waitlist offer notification failed for waitlist_id=%s", waitlist_entry.get("id"))


def accept_offer(db: Client, offer_id: str) -> str:
    """Returns the new appointment_id."""
    rows = db.table("waitlist_offers").select("*, waitlist(*)").eq("id", offer_id).limit(1).execute().data
    if not rows:
        raise HTTPException(status_code=404, detail="العرض غير موجود")
    offer = rows[0]
    if offer["response"] is not None:
        raise HTTPException(status_code=409, detail="تم الرد على هذا العرض مسبقاً")
    if datetime.fromisoformat(offer["expires_at"]) < datetime.now(timezone.utc):
        raise HTTPException(status_code=409, detail="انتهت مهلة هذا العرض")

    waitlist_entry = offer["waitlist"]
    slot = db.table("slots").select("*").eq("id", offer["slot_id"]).limit(1).execute().data
    if not slot or slot[0]["status"] != "reserved":
        raise HTTPException(status_code=409, detail="الموعد لم يعد متاحاً")
    slot = slot[0]

    session_id = f"waitlist:{offer_id}"
    held = (
        db.table("slots")
        .update({"status": "temporarily_held", "held_by_session": session_id})
        .eq("id", slot["id"])
        .eq("status", "reserved")
        .execute()
    )
    if not held.data:
        raise HTTPException(status_code=409, detail="الموعد لم يعد متاحاً")

    result = db.rpc(
        "book_slot",
        {
            "p_slot_id": slot["id"],
            "p_patient_id": waitlist_entry["patient_id"],
            "p_held_by_session": session_id,
            "p_notes": None,
            "p_source": "waitlist",
        },
    ).execute()
    appointment_id = result.data
    db.table("appointments").update(
        {"appointment_number": generate_appointment_number(), "confirmation_code": generate_confirmation_code()}
    ).eq("id", appointment_id).execute()

    db.table("waitlist_offers").update(
        {"response": "accepted", "responded_at": datetime.now(timezone.utc).isoformat()}
    ).eq("id", offer_id).execute()
    db.table("waitlist").update({"status": "booked"}).eq("id", waitlist_entry["id"]).execute()

    return appointment_id


def decline_offer(db: Client, offer_id: str) -> None:
    rows = db.table("waitlist_offers").select("*").eq("id", offer_id).limit(1).execute().data
    if not rows:
        raise HTTPException(status_code=404, detail="العرض غير موجود")
    offer = rows[0]
    if offer["response"] is not None:
        raise HTTPException(status_code=409, detail="تم الرد على هذا العرض مسبقاً")

    db.table("waitlist_offers").update(
        {"response": "declined", "responded_at": datetime.now(timezone.utc).isoformat()}
    ).eq("id", offer_id).execute()
    db.table("waitlist").update({"status": "active"}).eq("id", offer["waitlist_id"]).execute()
    db.table("slots").update({"status": "available"}).eq("id", offer["slot_id"]).eq("status", "reserved").execute()

    offer_slot_to_top_candidate(db, offer["slot_id"])


def process_expired_offers(db: Client) -> int:
    now = datetime.now(timezone.utc).isoformat()
    expired = db.table("waitlist_offers").select("*").is_("response", "null").lt("expires_at", now).execute().data
    for offer in expired:
        db.table("waitlist_offers").update(
            {"response": "expired", "responded_at": datetime.now(timezone.utc).isoformat()}
        ).eq("id", offer["id"]).execute()
        db.table("waitlist").update({"status": "active"}).eq("id", offer["waitlist_id"]).execute()

        slot = db.table("slots").select("status").eq("id", offer["slot_id"]).limit(1).execute().data
        if slot and slot[0]["status"] == "reserved":
            db.table("slots").update({"status": "available"}).eq("id", offer["slot_id"]).execute()
            offer_slot_to_top_candidate(db, offer["slot_id"])
    return len(expired)
