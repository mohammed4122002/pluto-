import secrets
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

from postgrest.exceptions import APIError
from supabase import Client

from app.services.text_match import fuzzy_contains


class BookingError(Exception):
    pass


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
        # Plain ILIKE would miss "ايلا" vs "إيلا" (different hamza forms of
        # the same name) — fetch this branch's doctors and compare with
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
            .execute()
            .data
            if branch_staff_ids
            else []
        )
        matches = [c for c in candidates if fuzzy_contains(c["full_name"], doctor_name)]
        if not matches:
            return []
        doctor_id = matches[0]["id"]

    branch_rows = db.table("branches").select("timezone").eq("id", branch_id).limit(1).execute().data
    tz = ZoneInfo((branch_rows[0].get("timezone") if branch_rows else None) or "Asia/Amman")

    query = (
        db.table("slots")
        .select("id, start_at, duration_minutes, staff!slots_doctor_id_fkey(full_name)")
        .eq("branch_id", branch_id)
        .eq("status", "available")
        .gte("start_at", date_from or datetime.now(timezone.utc).isoformat())
        .order("start_at")
        .limit(limit)
    )
    if doctor_id:
        query = query.eq("doctor_id", doctor_id)
    if date_to:
        query = query.lt("start_at", date_to)

    rows = query.execute().data
    result = []
    for r in rows:
        start_utc = datetime.fromisoformat(r["start_at"].replace("Z", "+00:00"))
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
