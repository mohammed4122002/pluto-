import secrets
from datetime import datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

from postgrest.exceptions import APIError
from supabase import Client

from app.services.text_match import fuzzy_contains


class BookingError(Exception):
    pass


def _resolve_doctor_id(db: Client, branch_id: str, doctor_name: str) -> str | None:
    # Plain ILIKE would miss "ايلا" vs "إيلا" (different hamza forms of the
    # same name) — fetch this branch's doctors and compare with
    # Arabic-normalized matching instead of a raw DB substring match.
    branch_staff_ids = [
        row["staff_id"]
        for row in db.table("staff_branches").select("staff_id").eq("branch_id", branch_id).execute().data
    ]
    candidates = (
        db.table("staff")
        .select("id, full_name")
        .in_("id", branch_staff_ids)
        .eq("role", "doctor")
        .eq("is_active", True)
        .eq("availability_status", "available")
        .execute()
        .data
        if branch_staff_ids
        else []
    )
    matches = [c for c in candidates if fuzzy_contains(c["full_name"], doctor_name)]
    return matches[0]["id"] if matches else None


def _load_booking_window(db: Client) -> dict:
    rows = (
        db.table("clinic_settings")
        .select("min_booking_lead_minutes, max_booking_advance_days, same_day_cutoff_time")
        .limit(1)
        .execute()
        .data
    )
    return rows[0] if rows else {}


def _window_violation_reason(window: dict, tz: ZoneInfo, start_utc: datetime) -> str | None:
    """None if the slot is bookable under the clinic's booking-window rules
    (FR-SCH-017/018/019); otherwise a patient-facing Arabic reason. Checked
    both when listing slots (so we never offer one that'll be rejected) and
    again right before booking (so a stale/carried-over time can't slip
    through)."""
    now = datetime.now(timezone.utc)
    start_local = start_utc.astimezone(tz)

    lead_minutes = window.get("min_booking_lead_minutes") or 0
    if lead_minutes and start_utc < now + timedelta(minutes=lead_minutes):
        return f"هذا الوقت أقرب من الحد الأدنى المسموح للحجز ({lead_minutes} دقيقة مسبقاً)."

    advance_days = window.get("max_booking_advance_days")
    if advance_days and start_utc > now + timedelta(days=advance_days):
        return f"هذا الوقت أبعد من الحد الأقصى المسموح للحجز مسبقاً ({advance_days} يوم)."

    cutoff = window.get("same_day_cutoff_time")
    if cutoff and start_local.date() == now.astimezone(tz).date():
        cutoff_time = cutoff if isinstance(cutoff, time) else time.fromisoformat(str(cutoff))
        if now.astimezone(tz).time() >= cutoff_time:
            return "انتهى وقت استقبال حجوزات نفس اليوم — جرّبي يوم تاني."

    return None


def search_available_slots(
    db: Client,
    branch_id: str,
    *,
    doctor_name: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    limit: int = 8,
) -> list[dict]:
    doctor_id = None
    if doctor_name:
        doctor_id = _resolve_doctor_id(db, branch_id, doctor_name)
        if not doctor_id:
            return []

    branch_rows = db.table("branches").select("timezone").eq("id", branch_id).limit(1).execute().data
    tz = ZoneInfo((branch_rows[0].get("timezone") if branch_rows else None) or "Asia/Amman")
    window = _load_booking_window(db)

    # Pull a wider page than requested since the booking-window filter below
    # may drop some — still cheap, and far simpler than pushing lead/advance
    # limits into the query itself.
    query = (
        db.table("slots")
        .select("id, start_at, duration_minutes, staff!slots_doctor_id_fkey(full_name)")
        .eq("branch_id", branch_id)
        .eq("status", "available")
        .gte("start_at", date_from or datetime.now(timezone.utc).isoformat())
        .order("start_at")
        .limit(limit * 4)
    )
    if doctor_id:
        query = query.eq("doctor_id", doctor_id)
    if date_to:
        query = query.lt("start_at", date_to)

    rows = query.execute().data
    result = []
    for r in rows:
        start_utc = datetime.fromisoformat(r["start_at"].replace("Z", "+00:00"))
        if _window_violation_reason(window, tz, start_utc):
            continue
        result.append(
            {
                "slot_id": r["id"],
                "doctor_name": (r.get("staff") or {}).get("full_name"),
                # Clinic-local time, already converted — show this to the
                # patient as-is, don't reinterpret or convert it again.
                "start_at_clinic_local_time": start_utc.astimezone(tz).isoformat(),
                "duration_minutes": r["duration_minutes"],
            }
        )
        if len(result) >= limit:
            break
    return result


def _generate_appointment_number() -> str:
    today = datetime.now(timezone.utc).strftime("%Y%m%d")
    return f"APT-{today}-{secrets.token_hex(3).upper()}"


def _generate_confirmation_code() -> str:
    return secrets.token_hex(3).upper()


def book_slot_for_patient(
    db: Client,
    *,
    slot_id: str,
    patient_id: str,
    visit_for_name: str | None,
    notes: str | None,
) -> dict:
    """Books via the same atomic book_slot() DB function the staff dashboard
    uses (db/migrations/0011_slots_engine.sql) — a caller only ever gets an
    appointment back here if the booking genuinely succeeded."""
    final_notes = notes or ""
    if visit_for_name and visit_for_name.strip():
        patient_rows = db.table("patients").select("full_name, phone").eq("id", patient_id).limit(1).execute().data
        patient = patient_rows[0] if patient_rows else {}
        current_name = patient.get("full_name")
        is_placeholder_name = not current_name or current_name.startswith("tg:") or current_name == patient.get("phone")
        if is_placeholder_name:
            db.table("patients").update({"full_name": visit_for_name.strip()}).eq("id", patient_id).execute()
        elif visit_for_name.strip() != current_name:
            # Different name than what's on file for this contact -> booking
            # for someone else (e.g. "احجزلي لأمي") — keep the appointment
            # under the messaging contact, but make sure the front desk sees
            # who the visit is actually for.
            final_notes = (f"الحجز لأجل: {visit_for_name.strip()}. " + final_notes).strip()

    try:
        result = db.rpc(
            "book_slot",
            {
                "p_slot_id": slot_id,
                "p_patient_id": patient_id,
                "p_held_by_session": f"ai-chat:{secrets.token_hex(4)}",
                "p_notes": final_notes or None,
                "p_source": "ai_chat",
            },
        ).execute()
    except APIError as exc:
        if exc.code == "P0002":
            # slot_id doesn't exist at all — almost always means the model
            # reused/guessed an id instead of one just returned by
            # find_available_slots in this same turn (tool results from a
            # prior turn aren't stored anywhere it can re-read them).
            raise BookingError(
                "slot_id غير موجود إطلاقاً. لازم تستدعي find_available_slots الآن ضمن نفس هذا الرد "
                "للحصول على slot_id حقيقي وطازج — لا يوجد عندك slot_id صالح من محادثة سابقة."
            ) from exc
        raise BookingError("هذا الموعد لم يعد متاحاً، تم حجزه للتو من شخص آخر.") from exc

    appointment_id = result.data
    return (
        db.table("appointments")
        .update(
            {
                "appointment_number": _generate_appointment_number(),
                "confirmation_code": _generate_confirmation_code(),
            }
        )
        .eq("id", appointment_id)
        .execute()
        .data[0]
    )


def book_by_doctor_and_time(
    db: Client,
    branch_id: str,
    *,
    doctor_name: str,
    requested_start_at: str,
    patient_id: str,
    visit_for_name: str | None,
    notes: str | None,
) -> dict:
    """Books directly from (doctor_name, requested time) instead of an opaque
    slot_id — the model only ever has to carry text it already generated
    (a name, a time it just showed the patient) across turns, never an id
    from a previous tool call it has no way to still have. Looks up the
    matching available slot and books it in one shot; if that exact time
    isn't available anymore, returns booked=False with fresh alternatives
    instead of raising, since "time taken" is an expected outcome here, not
    an error."""
    doctor_id = _resolve_doctor_id(db, branch_id, doctor_name)
    if not doctor_id:
        raise BookingError(
            f"ما في طبيب فعلي بالاسم '{doctor_name}' بهذا الفرع — استدعي find_doctors للتأكد من الاسم الصحيح."
        )

    branch_rows = db.table("branches").select("timezone").eq("id", branch_id).limit(1).execute().data
    tz = ZoneInfo((branch_rows[0].get("timezone") if branch_rows else None) or "Asia/Amman")

    try:
        requested_dt = datetime.fromisoformat(requested_start_at)
    except ValueError as exc:
        raise BookingError(
            "صيغة start_at غير مفهومة — لازم تكون بنفس صيغة start_at_clinic_local_time الراجعة من "
            "find_available_slots، بدون تعديل."
        ) from exc
    if requested_dt.tzinfo is None:
        requested_dt = requested_dt.replace(tzinfo=tz)
    requested_utc = requested_dt.astimezone(timezone.utc)

    window = _load_booking_window(db)
    violation = _window_violation_reason(window, tz, requested_utc)
    if violation:
        day_start_local = requested_dt.astimezone(tz).replace(hour=0, minute=0, second=0, microsecond=0)
        day_end_local = day_start_local.replace(hour=23, minute=59, second=59)
        alternatives = search_available_slots(
            db,
            branch_id,
            doctor_name=doctor_name,
            date_from=day_start_local.astimezone(timezone.utc).isoformat(),
            date_to=day_end_local.astimezone(timezone.utc).isoformat(),
        )
        return {"booked": False, "reason": violation, "alternative_slots": alternatives}

    slot_rows = (
        db.table("slots")
        .select("id")
        .eq("branch_id", branch_id)
        .eq("doctor_id", doctor_id)
        .eq("status", "available")
        .eq("start_at", requested_utc.isoformat())
        .limit(1)
        .execute()
        .data
    )
    if not slot_rows:
        day_start_local = requested_dt.astimezone(tz).replace(hour=0, minute=0, second=0, microsecond=0)
        day_end_local = day_start_local.replace(hour=23, minute=59, second=59)
        alternatives = search_available_slots(
            db,
            branch_id,
            doctor_name=doctor_name,
            date_from=day_start_local.astimezone(timezone.utc).isoformat(),
            date_to=day_end_local.astimezone(timezone.utc).isoformat(),
        )
        return {
            "booked": False,
            "reason": "هذا الوقت بالضبط مع هذا الطبيب مش متاح (خذه شخص ثاني للتو أو تغيّر الجدول).",
            "alternative_slots": alternatives,
        }

    slot_id = slot_rows[0]["id"]
    appointment = book_slot_for_patient(
        db, slot_id=slot_id, patient_id=patient_id, visit_for_name=visit_for_name, notes=notes
    )
    return {"booked": True, **appointment}
