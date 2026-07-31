from collections import defaultdict
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException
from postgrest.exceptions import APIError
from supabase import Client

from app.services.appointments import apply_status_transition, generate_appointment_number, generate_confirmation_code
from app.services.waitlist import offer_slot_to_top_candidate

_ARRIVAL_EARLY_MINUTES = 15
_ARRIVAL_ON_TIME_MINUTES = 5
_ARRIVAL_LATE_MINUTES = 20

_CANCELLED_BY_STATUS = {"patient": "cancelled_by_patient", "clinic": "cancelled_by_clinic", "doctor": "cancelled_by_doctor"}


def release_slot_and_offer_waitlist(db: Client, slot_id: str) -> None:
    db.table("slots").update({"status": "available", "held_until": None, "held_by_session": None}).eq("id", slot_id).execute()
    offer_slot_to_top_candidate(db, slot_id)


def _find_cancellation_policy(db: Client, branch_id: str, service_id: str | None, doctor_id: str | None) -> dict | None:
    """Most-specific match wins (doctor+service > service > branch-wide). A
    policy naming a specific service/doctor never matches a different one."""
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


def _compute_fee(policy: dict | None, fee_kind: str, price_base: float) -> float:
    if not policy:
        return 0.0
    fee_type = policy.get(f"{fee_kind}_fee_type", "none")
    fee_value = float(policy.get(f"{fee_kind}_fee_value", 0) or 0)
    if fee_type == "fixed":
        return fee_value
    if fee_type == "percentage":
        return round((price_base or 0) * fee_value / 100, 2)
    return 0.0


def _charge_fee(db: Client, appointment: dict, fee: float) -> None:
    branch = db.table("branches").select("currency").eq("id", appointment["branch_id"]).limit(1).execute().data
    currency = (branch[0]["currency"] if branch else None) or ""
    db.table("payments").insert(
        {
            "appointment_id": appointment["id"],
            "patient_id": appointment["patient_id"],
            "amount": fee,
            "currency": currency,
            "payment_instructions_sent_at": datetime.now(timezone.utc).isoformat(),
        }
    ).execute()


def reschedule_appointment(
    db: Client, appointment_id: str, new_slot_id: str, session_id: str, reason: str | None, changed_by: str | None
) -> dict:
    """BR-014: the old appointment is never deleted — it's marked 'rescheduled'
    and a new appointment row is created linking back via previous_appointment_id."""
    old_rows = db.table("appointments").select("*").eq("id", appointment_id).limit(1).execute().data
    if not old_rows:
        raise HTTPException(status_code=404, detail="الموعد غير موجود")
    old = old_rows[0]

    new_slot_rows = db.table("slots").select("*").eq("id", new_slot_id).limit(1).execute().data
    if not new_slot_rows:
        raise HTTPException(status_code=404, detail="الموعد الجديد غير موجود")
    new_slot = new_slot_rows[0]

    held = (
        db.table("slots")
        .update({"status": "temporarily_held", "held_by_session": session_id})
        .eq("id", new_slot_id)
        .eq("status", "available")
        .execute()
    )
    if not held.data:
        raise HTTPException(status_code=409, detail="الموعد الجديد لم يعد متاحاً — تم حجزه للتو من مستخدم آخر.")

    new_status = "confirmed" if old["status"] in ("confirmed", "patient_confirmed") else "requested"
    new_appt = (
        db.table("appointments")
        .insert(
            {
                "branch_id": new_slot["branch_id"],
                "patient_id": old["patient_id"],
                "staff_id": new_slot["doctor_id"],
                "service_id": new_slot["service_id"] or old["service_id"],
                "scheduled_at": new_slot["start_at"],
                "duration_minutes": new_slot["duration_minutes"],
                "source": old["source"],
                "notes": old["notes"],
                "reason_for_visit": old["reason_for_visit"],
                "priority": old["priority"],
                "guardian_id": old.get("guardian_id"),
                "slot_id": new_slot_id,
                "previous_appointment_id": appointment_id,
                "status": new_status,
                "appointment_number": generate_appointment_number(),
                "confirmation_code": generate_confirmation_code(),
            }
        )
        .execute()
        .data[0]
    )
    db.table("slots").update({"status": "booked", "held_by_session": None}).eq("id", new_slot_id).execute()

    apply_status_transition(db, appointment_id, "rescheduled", reason, changed_by)

    if old.get("slot_id"):
        release_slot_and_offer_waitlist(db, old["slot_id"])

    return new_appt


def cancel_appointment(db: Client, appointment_id: str, reason: str, cancelled_by: str, changed_by: str | None) -> dict:
    rows = db.table("appointments").select("*, services(price)").eq("id", appointment_id).limit(1).execute().data
    if not rows:
        raise HTTPException(status_code=404, detail="الموعد غير موجود")
    appt = rows[0]
    new_status = _CANCELLED_BY_STATUS.get(cancelled_by, "cancelled_by_clinic")

    fee = 0.0
    if cancelled_by == "patient":
        policy = _find_cancellation_policy(db, appt["branch_id"], appt.get("service_id"), appt.get("staff_id"))
        hours_before = (policy or {}).get("hours_before_threshold", 24)
        hours_remaining = (datetime.fromisoformat(appt["scheduled_at"]) - datetime.now(timezone.utc)).total_seconds() / 3600
        if hours_remaining < hours_before:
            price = (appt.get("services") or {}).get("price") or 0
            fee = _compute_fee(policy, "cancellation", price)

    updated = apply_status_transition(db, appointment_id, new_status, reason, changed_by)
    if fee > 0:
        _charge_fee(db, appt, fee)
    if appt.get("slot_id"):
        release_slot_and_offer_waitlist(db, appt["slot_id"])

    return {"appointment": updated, "fee_charged": fee}


def bulk_cancel_appointments(
    db: Client, branch_id: str | None, doctor_id: str | None, date_from: str, date_to: str, reason: str, changed_by: str | None
) -> int:
    """Doctor-absence / branch-closure cancellation — clinic-caused, so no fee."""
    query = (
        db.table("appointments")
        .select("id, slot_id")
        .gte("scheduled_at", date_from)
        .lt("scheduled_at", date_to)
        .in_("status", ["confirmed", "patient_confirmed", "requested", "checked_in", "waitlisted"])
    )
    if branch_id:
        query = query.eq("branch_id", branch_id)
    if doctor_id:
        query = query.eq("staff_id", doctor_id)
    rows = query.execute().data

    new_status = "cancelled_by_doctor" if doctor_id else "cancelled_by_clinic"
    count = 0
    for row in rows:
        try:
            apply_status_transition(db, row["id"], new_status, reason, changed_by)
        except HTTPException:
            continue
        count += 1
        if row.get("slot_id"):
            release_slot_and_offer_waitlist(db, row["slot_id"])
    return count


def _find_substitute(db: Client, doctor_id: str, branch_id: str | None, start_at: str, end_at: str) -> str | None:
    """A substitute registered for this doctor whose covered window overlaps
    the absence period. If more than one branch has a substitute
    arrangement, prefer the one scoped to this specific branch."""
    rows = (
        db.table("doctor_substitutes")
        .select("substitute_staff_id, branch_id")
        .eq("staff_id", doctor_id)
        .lt("start_at", end_at)
        .gt("end_at", start_at)
        .execute()
        .data
    )
    if not rows:
        return None
    if branch_id:
        branch_specific = [r for r in rows if r["branch_id"] == branch_id]
        if branch_specific:
            return branch_specific[0]["substitute_staff_id"]
        branch_wide = [r for r in rows if r["branch_id"] is None]
        if branch_wide:
            return branch_wide[0]["substitute_staff_id"]
        return None
    return rows[0]["substitute_staff_id"]


def handle_doctor_absence(
    db: Client, doctor_id: str, branch_id: str | None, date_from: str, date_to: str, reason: str, changed_by: str | None
) -> dict:
    """For each affected appointment, tries to move it to a registered
    substitute at the exact same time first (BR: doctor_substitutes covering
    this window) — only falls back to cancel-and-waitlist (same as
    bulk_cancel_appointments) when no substitute exists or the substitute
    has no open slot at that exact time. No fee either way since this is
    clinic-caused."""
    query = (
        db.table("appointments")
        .select("id, branch_id, patient_id, service_id, slot_id, scheduled_at, duration_minutes, notes, status")
        .gte("scheduled_at", date_from)
        .lt("scheduled_at", date_to)
        .eq("staff_id", doctor_id)
        .in_("status", ["confirmed", "patient_confirmed", "requested", "checked_in", "waitlisted"])
    )
    if branch_id:
        query = query.eq("branch_id", branch_id)
    rows = query.execute().data

    substitute_id = _find_substitute(db, doctor_id, branch_id, date_from, date_to)
    # checked_in/waitlisted appointments aren't reschedulable (the patient is
    # already at the clinic, or the "booking" is only speculative to begin
    # with) — only genuinely confirmed/requested visits get moved.
    _reassignable_statuses = {"confirmed", "patient_confirmed", "requested"}
    reassigned = 0
    cancelled = 0

    for appt in rows:
        moved = False
        if substitute_id and appt["status"] in _reassignable_statuses:
            substitute_slot = (
                db.table("slots")
                .select("id")
                .eq("branch_id", appt["branch_id"])
                .eq("doctor_id", substitute_id)
                .eq("start_at", appt["scheduled_at"])
                .eq("status", "available")
                .limit(1)
                .execute()
                .data
            )
            if substitute_slot:
                new_slot_id = substitute_slot[0]["id"]
                try:
                    result = db.rpc(
                        "book_slot",
                        {
                            "p_slot_id": new_slot_id,
                            "p_patient_id": appt["patient_id"],
                            "p_held_by_session": f"absence-reassign:{appt['id']}",
                            "p_notes": appt.get("notes"),
                            "p_source": "doctor_absence_reassignment",
                        },
                    ).execute()
                    new_appointment_id = result.data
                    db.table("appointments").update(
                        {
                            "appointment_number": generate_appointment_number(),
                            "confirmation_code": generate_confirmation_code(),
                            "previous_appointment_id": appt["id"],
                        }
                    ).eq("id", new_appointment_id).execute()
                    apply_status_transition(db, appt["id"], "rescheduled", reason, changed_by)
                    if appt.get("slot_id"):
                        release_slot_and_offer_waitlist(db, appt["slot_id"])
                    moved = True
                    reassigned += 1
                except (APIError, HTTPException):
                    # Either the slot got taken between the check and the
                    # book_slot() call, or this appointment's current status
                    # doesn't allow a "rescheduled" transition (e.g. already
                    # checked_in) — fall back to the cancel path below either
                    # way rather than losing the appointment entirely.
                    moved = False

        if not moved:
            new_status = "cancelled_by_doctor"
            try:
                apply_status_transition(db, appt["id"], new_status, reason, changed_by)
                cancelled += 1
                if appt.get("slot_id"):
                    release_slot_and_offer_waitlist(db, appt["slot_id"])
            except HTTPException:
                continue

    return {
        "total_affected": len(rows),
        "reassigned_count": reassigned,
        "cancelled_count": cancelled,
        "substitute_staff_id": substitute_id,
    }


def mark_no_show(db: Client, appointment_id: str, reason: str | None, changed_by: str | None, override_grace: bool) -> dict:
    rows = db.table("appointments").select("*, services(price)").eq("id", appointment_id).limit(1).execute().data
    if not rows:
        raise HTTPException(status_code=404, detail="الموعد غير موجود")
    appt = rows[0]

    if not override_grace:
        settings_rows = db.table("clinic_settings").select("no_show_grace_minutes").limit(1).execute().data
        grace_minutes = settings_rows[0]["no_show_grace_minutes"] if settings_rows else 15
        scheduled_at = datetime.fromisoformat(appt["scheduled_at"])
        if datetime.now(timezone.utc) < scheduled_at + timedelta(minutes=grace_minutes):
            raise HTTPException(status_code=409, detail=f"فترة السماح ({grace_minutes} دقيقة) لم تنتهِ بعد.")

    updated = apply_status_transition(db, appointment_id, "no_show", reason, changed_by)

    policy = _find_cancellation_policy(db, appt["branch_id"], appt.get("service_id"), appt.get("staff_id"))
    price = (appt.get("services") or {}).get("price") or 0
    fee = _compute_fee(policy, "no_show", price)
    if fee > 0:
        _charge_fee(db, appt, fee)
    if appt.get("slot_id"):
        release_slot_and_offer_waitlist(db, appt["slot_id"])

    return {"appointment": updated, "fee_charged": fee}


def no_show_rate_report(
    db: Client, branch_ids: list[str] | None, group_by: str, date_from: str | None, date_to: str | None
) -> list[dict]:
    key_field = {"doctor": "staff_id", "branch": "branch_id", "service": "service_id"}[group_by]
    query = (
        db.table("appointments")
        .select(f"status,{key_field}")
        .in_("status", ["completed", "no_show", "checked_in", "checked_out", "in_consultation", "procedure_started"])
    )
    if branch_ids is not None:
        query = query.in_("branch_id", branch_ids)
    if date_from:
        query = query.gte("scheduled_at", date_from)
    if date_to:
        query = query.lt("scheduled_at", date_to)
    rows = query.execute().data

    buckets: dict[str, dict[str, int]] = defaultdict(lambda: {"total": 0, "no_show": 0})
    for r in rows:
        k = r.get(key_field) or "unknown"
        buckets[k]["total"] += 1
        if r["status"] == "no_show":
            buckets[k]["no_show"] += 1

    return [
        {"key": k, "total": v["total"], "no_show": v["no_show"], "rate": round(v["no_show"] / v["total"] * 100, 1) if v["total"] else 0}
        for k, v in buckets.items()
    ]


def _arrival_status(scheduled_at: datetime, checked_in_at: datetime) -> str:
    delta_minutes = (checked_in_at - scheduled_at).total_seconds() / 60
    if delta_minutes < -_ARRIVAL_EARLY_MINUTES:
        return "early"
    if delta_minutes <= _ARRIVAL_ON_TIME_MINUTES:
        return "on_time"
    if delta_minutes <= _ARRIVAL_LATE_MINUTES:
        return "late"
    return "very_late"


def check_in_appointment(
    db: Client, appointment_id: str, priority_level: str, changed_by: str | None, is_walk_in: bool = False
) -> dict:
    rows = db.table("appointments").select("*").eq("id", appointment_id).limit(1).execute().data
    if not rows:
        raise HTTPException(status_code=404, detail="الموعد غير موجود")
    appt = rows[0]

    apply_status_transition(db, appointment_id, "checked_in", None, changed_by)
    # The status machine models the waiting room explicitly (checked_in -> waiting
    # -> called -> in_consultation) — a freshly checked-in patient is immediately
    # waiting, so chain straight through rather than leaving it stranded at
    # 'checked_in' where queue.call_ticket's 'waiting'->'called' transition can't reach it.
    updated = apply_status_transition(db, appointment_id, "waiting", None, changed_by)

    now = datetime.now(timezone.utc)
    arrival_status = _arrival_status(datetime.fromisoformat(appt["scheduled_at"]), now)

    queue_date = now.date().isoformat()
    queue_rows = (
        db.table("queues")
        .select("id")
        .eq("branch_id", appt["branch_id"])
        .eq("doctor_id", appt["staff_id"])
        .eq("queue_date", queue_date)
        .execute()
        .data
    )
    if queue_rows:
        queue_id = queue_rows[0]["id"]
    else:
        queue_id = (
            db.table("queues")
            .insert(
                {
                    "branch_id": appt["branch_id"],
                    "doctor_id": appt["staff_id"],
                    "service_id": appt.get("service_id"),
                    "queue_date": queue_date,
                }
            )
            .execute()
            .data[0]["id"]
        )

    last_ticket = (
        db.table("queue_tickets").select("ticket_number").eq("queue_id", queue_id).order("ticket_number", desc=True).limit(1).execute().data
    )
    next_number = (last_ticket[0]["ticket_number"] + 1) if last_ticket else 1

    ticket = (
        db.table("queue_tickets")
        .insert(
            {
                "queue_id": queue_id,
                "appointment_id": appointment_id,
                "patient_id": appt["patient_id"],
                "ticket_number": next_number,
                "priority_level": priority_level,
                "arrival_status": arrival_status,
                "is_walk_in": is_walk_in,
            }
        )
        .execute()
        .data[0]
    )
    db.table("appointments").update({"queue_number": next_number}).eq("id", appointment_id).execute()

    return {"appointment": updated, "ticket": ticket}


_URGENT_WALKIN_PRIORITIES = {"critical", "emergency"}

_EMERGENCY_NOTICE = (
    "هذا النظام لا يغني عن خدمات الطوارئ — إذا كانت الحالة فعلاً طارئة أو تهدد الحياة، "
    "يجب التوجه فوراً لأقرب قسم طوارئ أو الاتصال بالإسعاف بدل انتظار الدور بالعيادة."
)


def register_walk_in(
    db: Client,
    branch_id: str,
    patient_id: str,
    doctor_id: str | None,
    service_id: str | None,
    priority_level: str,
    notes: str | None,
    changed_by: str | None,
) -> dict:
    """FR-WIN-001/002: books the nearest available slot for a walk-in patient
    (matching doctor/service if given) and checks them straight into today's
    queue; if nothing is open right now, registers the visit directly without
    a slots-table reservation rather than turning the patient away. FR-WIN-003
    /004: a critical/emergency walk-in is inserted ahead of already-waiting
    normal-priority tickets instead of appended at the end — the result
    reports how many tickets were bumped so staff see the impact before it
    happens. FR-WIN-007: never a substitute for real emergency services —
    emergency_notice carries that warning back to staff for urgent cases."""
    now = datetime.now(timezone.utc)
    slot_query = (
        db.table("slots")
        .select("id, doctor_id, start_at, duration_minutes")
        .eq("branch_id", branch_id)
        .eq("status", "available")
        .gte("start_at", now.isoformat())
        .order("start_at")
        .limit(1)
    )
    if doctor_id:
        slot_query = slot_query.eq("doctor_id", doctor_id)
    if service_id:
        slot_query = slot_query.eq("service_id", service_id)
    slot_rows = slot_query.execute().data

    if slot_rows:
        slot = slot_rows[0]
        result = db.rpc(
            "book_slot",
            {
                "p_slot_id": slot["id"],
                "p_patient_id": patient_id,
                "p_held_by_session": f"walk-in:{patient_id}:{now.isoformat()}",
                "p_notes": notes,
                "p_source": "walk_in",
            },
        ).execute()
        appointment_id = result.data
        db.table("appointments").update(
            {"appointment_number": generate_appointment_number(), "confirmation_code": generate_confirmation_code()}
        ).eq("id", appointment_id).execute()
        matched_slot = True
    else:
        appt = (
            db.table("appointments")
            .insert(
                {
                    "branch_id": branch_id,
                    "patient_id": patient_id,
                    "staff_id": doctor_id,
                    "service_id": service_id,
                    "scheduled_at": now.isoformat(),
                    "duration_minutes": 15,
                    "source": "walk_in",
                    "notes": notes,
                    "status": "requested",
                    "appointment_number": generate_appointment_number(),
                    "confirmation_code": generate_confirmation_code(),
                }
            )
            .execute()
            .data[0]
        )
        appointment_id = appt["id"]
        matched_slot = False

    check_in = check_in_appointment(db, appointment_id, priority_level, changed_by, is_walk_in=True)
    ticket = check_in["ticket"]
    bumped_count = 0

    if priority_level in _URGENT_WALKIN_PRIORITIES:
        waiting = (
            db.table("queue_tickets")
            .select("id, ticket_number, priority_level")
            .eq("queue_id", ticket["queue_id"])
            .eq("status", "waiting")
            .neq("id", ticket["id"])
            .execute()
            .data
        )
        ahead = [w for w in waiting if w["priority_level"] not in _URGENT_WALKIN_PRIORITIES]
        if ahead:
            new_position = min(w["ticket_number"] for w in ahead)
            for w in ahead:
                db.table("queue_tickets").update({"ticket_number": w["ticket_number"] + 1}).eq("id", w["id"]).execute()
            ticket = db.table("queue_tickets").update({"ticket_number": new_position}).eq("id", ticket["id"]).execute().data[0]
            bumped_count = len(ahead)

    return {
        "appointment": check_in["appointment"],
        "ticket": ticket,
        "matched_available_slot": matched_slot,
        "bumped_ticket_count": bumped_count,
        "emergency_notice": _EMERGENCY_NOTICE if priority_level in _URGENT_WALKIN_PRIORITIES else None,
    }


def record_triage(db: Client, ticket_id: str, triage_level: str, triage_notes: str | None, changed_by: str | None) -> dict:
    """FR-WIN-006: lets a nurse attach a triage assessment to an existing
    queue ticket (walk-in or regular check-in alike)."""
    rows = db.table("queue_tickets").select("id").eq("id", ticket_id).limit(1).execute().data
    if not rows:
        raise HTTPException(status_code=404, detail="التذكرة غير موجودة")
    return (
        db.table("queue_tickets")
        .update(
            {
                "triage_level": triage_level,
                "triage_notes": triage_notes,
                "triaged_by": changed_by,
                "triaged_at": datetime.now(timezone.utc).isoformat(),
            }
        )
        .eq("id", ticket_id)
        .execute()
        .data[0]
    )
