from datetime import datetime, timezone
from zoneinfo import ZoneInfo

from supabase import Client

from app.services.booking import BookingError

# Terminal/non-cancellable statuses — anything else (requested, confirmed,
# patient_confirmed, checked_in, waiting, called, in_consultation,
# procedure_started, on_hold, waitlisted, rescheduled) is fair game.
_ALREADY_CLOSED_STATUSES = {
    "completed",
    "cancelled_by_patient",
    "cancelled_by_clinic",
    "cancelled_by_doctor",
    "cancelled",
    "no_show",
    "rejected",
    "expired",
}


def _apply_status_transition(db: Client, appointment_id: str, new_status: str, reason: str | None) -> dict:
    current = db.table("appointments").select("*").eq("id", appointment_id).limit(1).execute().data
    if not current:
        raise BookingError("الموعد غير موجود.")
    appt = current[0]
    old_status = appt["status"]
    if old_status == new_status:
        return appt

    allowed = (
        db.table("status_transitions")
        .select("id")
        .eq("from_status", old_status)
        .eq("to_status", new_status)
        .limit(1)
        .execute()
        .data
    )
    if not allowed:
        raise BookingError(f"تعذّر تغيير حالة الموعد من {old_status} إلى {new_status}.")

    updates: dict = {"status": new_status}
    if new_status == "cancelled_by_patient" and reason:
        updates["cancellation_reason"] = reason
    updated = db.table("appointments").update(updates).eq("id", appointment_id).execute().data[0]

    db.table("appointment_status_history").insert(
        {"appointment_id": appointment_id, "old_status": old_status, "new_status": new_status, "reason": reason}
    ).execute()
    return updated


def confirm_booking_and_request_payment(db: Client, appointment_id: str) -> dict | None:
    """Immediately confirms a just-booked (status='requested') appointment —
    a chat booking is a real-time slot reservation the patient just confirmed
    themselves, not a request awaiting staff review, so there's nothing to
    hold it on. If the service has a price/deposit configured, opens a
    pending payment and returns what the AI should tell the patient (amount,
    currency, how to pay); returns None if no payment step applies."""
    _apply_status_transition(db, appointment_id, "confirmed", None)

    appt = (
        db.table("appointments")
        .select("branch_id, patient_id, appointment_number, patient_package_id, services(price, deposit_amount)")
        .eq("id", appointment_id)
        .limit(1)
        .execute()
        .data[0]
    )
    if appt.get("patient_package_id"):
        # Already billed against a package at booking time -- no fresh
        # payment to request, the visit is covered by a session there.
        return None
    service = appt.get("services") or {}
    amount = service.get("deposit_amount") or service.get("price")
    if not amount:
        return None
    payment_type = "deposit" if service.get("deposit_amount") else "full"

    branch = db.table("branches").select("currency").eq("id", appt["branch_id"]).limit(1).execute().data
    currency = (branch[0].get("currency") if branch else None) or ""

    db.table("payments").insert(
        {
            "appointment_id": appointment_id,
            "patient_id": appt["patient_id"],
            "amount": amount,
            "currency": currency,
            "payment_type": payment_type,
            "payment_instructions_sent_at": datetime.now(timezone.utc).isoformat(),
        }
    ).execute()

    methods = (
        db.table("payment_methods")
        .select("display_name, account_number")
        .or_(f"branch_id.eq.{appt['branch_id']},branch_id.is.null")
        .eq("is_active", True)
        .execute()
        .data
    )
    methods_text = "\n".join(f"- {m['display_name']}: {m.get('account_number') or ''}" for m in methods) or "تواصل معنا لمعرفة طرق الدفع."

    return {"amount": amount, "currency": currency, "methods_text": methods_text}


def find_upcoming_appointments_for_patient(db: Client, patient_id: str) -> list[dict]:
    rows = (
        db.table("appointments")
        .select(
            "id, scheduled_at, status, branch_id, "
            "staff!appointments_staff_id_fkey(full_name), services(name)"
        )
        .eq("patient_id", patient_id)
        .gte("scheduled_at", datetime.now(timezone.utc).isoformat())
        .order("scheduled_at")
        .execute()
        .data
    )
    result = []
    for r in rows:
        if r["status"] in _ALREADY_CLOSED_STATUSES:
            continue
        branch_rows = db.table("branches").select("timezone").eq("id", r["branch_id"]).limit(1).execute().data
        tz = ZoneInfo((branch_rows[0].get("timezone") if branch_rows else None) or "Asia/Amman")
        start_utc = datetime.fromisoformat(r["scheduled_at"].replace("Z", "+00:00"))
        result.append(
            {
                "appointment_id": r["id"],
                "doctor_name": (r.get("staff") or {}).get("full_name"),
                "service_name": (r.get("services") or {}).get("name"),
                "scheduled_at_clinic_local_time": start_utc.astimezone(tz).isoformat(),
                "status": r["status"],
            }
        )
    return result


def _find_cancellation_policy(db: Client, branch_id: str, service_id: str | None, doctor_id: str | None) -> dict | None:
    """Most-specific match wins (doctor+service > service > branch-wide) —
    mirrors backend/app/services/scheduling.py so patient-initiated
    cancellations via chat are charged under the exact same rules as
    staff-initiated ones."""
    rows = (
        db.table("cancellation_policies")
        .select("*")
        .eq("is_active", True)
        .or_(f"branch_id.eq.{branch_id},branch_id.is.null")
        .execute()
        .data
    )
    best: dict | None = None
    best_score = -1
    for p in rows:
        if p["service_id"] and p["service_id"] != service_id:
            continue
        if p["doctor_id"] and p["doctor_id"] != doctor_id:
            continue
        score = (4 if p["doctor_id"] else 0) + (2 if p["service_id"] else 0) + (1 if p["branch_id"] else 0)
        if score > best_score:
            best_score = score
            best = p
    return best


def _compute_fee(policy: dict | None, price_base: float) -> float:
    if not policy:
        return 0.0
    fee_type = policy.get("cancellation_fee_type", "none")
    fee_value = float(policy.get("cancellation_fee_value", 0) or 0)
    if fee_type == "fixed":
        return fee_value
    if fee_type == "percentage":
        return round((price_base or 0) * fee_value / 100, 2)
    return 0.0


def cancel_patient_appointment(db: Client, *, appointment_id: str, patient_id: str, reason: str | None) -> dict:
    rows = db.table("appointments").select("*, services(price)").eq("id", appointment_id).limit(1).execute().data
    if not rows:
        raise BookingError("ما لقيت هذا الموعد — تأكد من appointment_id عن طريق find_my_appointments.")
    appt = rows[0]
    if appt["patient_id"] != patient_id:
        # Never let a chat session cancel someone else's appointment.
        raise BookingError("هذا الموعد مش مسجل تحت هذا المريض.")
    if appt["status"] in _ALREADY_CLOSED_STATUSES:
        raise BookingError("هذا الموعد أصلاً ملغي أو منتهي — ما في داعي لإلغائه من جديد.")

    policy = _find_cancellation_policy(db, appt["branch_id"], appt.get("service_id"), appt.get("staff_id"))
    hours_before = (policy or {}).get("hours_before_threshold", 24)
    hours_remaining = (datetime.fromisoformat(appt["scheduled_at"]) - datetime.now(timezone.utc)).total_seconds() / 3600
    fee = 0.0
    if hours_remaining < hours_before:
        price = (appt.get("services") or {}).get("price") or 0
        fee = _compute_fee(policy, price)

    _apply_status_transition(db, appointment_id, "cancelled_by_patient", reason)

    currency = ""
    if fee > 0:
        branch = db.table("branches").select("currency").eq("id", appt["branch_id"]).limit(1).execute().data
        currency = (branch[0].get("currency") if branch else None) or ""
        db.table("payments").insert(
            {
                "appointment_id": appointment_id,
                "patient_id": patient_id,
                "amount": fee,
                "currency": currency,
                "payment_type": "cancellation_fee",
                "payment_instructions_sent_at": datetime.now(timezone.utc).isoformat(),
            }
        ).execute()

    if appt.get("slot_id"):
        db.table("slots").update({"status": "available", "held_until": None, "held_by_session": None}).eq(
            "id", appt["slot_id"]
        ).execute()

    return {"fee": fee, "currency": currency, "appointment_number": appt.get("appointment_number")}
