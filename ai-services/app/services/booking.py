import secrets
from datetime import datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

from postgrest.exceptions import APIError
from supabase import Client

from app.services.text_match import fuzzy_contains


class BookingError(Exception):
    pass


def _is_placeholder_name(name: str | None, phone: str | None) -> bool:
    """A patient record's full_name is auto-filled at first contact (Telegram
    display name, or the phone/synthetic id itself when no display name was
    sent) — this tells apart a name the patient actually gave us from one we
    made up to satisfy the not-null column."""
    return not name or name.startswith("tg:") or name == phone


def _is_placeholder_phone(phone: str | None) -> bool:
    """A synthetic 'tg:{chat_id}' value (still sent by n8n's legacy Telegram
    workflows) satisfies the patients.phone NOT NULL/unique constraint but
    isn't a number anyone can actually be called or texted on."""
    return not phone or phone.startswith("tg:")


def missing_contact_fields(db: Client, patient_id: str) -> list[str]:
    """Which of "name"/"phone" are still placeholders for this patient —
    booking must not proceed until both are real, since without a real name
    the confirmation is unattributed and without a real phone the clinic has
    no way to reach the patient about this appointment (reminders, changes,
    payment follow-up)."""
    rows = db.table("patients").select("full_name, phone").eq("id", patient_id).limit(1).execute().data
    if not rows:
        return ["name", "phone"]
    patient = rows[0]
    missing = []
    if _is_placeholder_name(patient.get("full_name"), patient.get("phone")):
        missing.append("name")
    if _is_placeholder_phone(patient.get("phone")):
        missing.append("phone")
    return missing


def save_contact_info(db: Client, patient_id: str, full_name: str, phone: str) -> dict:
    """Persists the name/phone the patient just gave in chat, so
    missing_contact_fields stops blocking book_appointment. A phone that
    already belongs to another patient record (same person previously
    messaged a different channel with their real number) is a dedup case for
    staff, not something the bot should silently overwrite or merge."""
    full_name = (full_name or "").strip()
    phone = (phone or "").strip()
    if not full_name or not phone:
        raise BookingError("لازم الاسم ورقم الهاتف الاثنين مع بعض، مش وحدة بس.")

    existing = db.table("patients").select("id").eq("phone", phone).neq("id", patient_id).limit(1).execute().data
    if existing:
        raise BookingError(
            "رقم الهاتف هذا مسجل مسبقاً بملف مريض ثاني عنا — لا تكمّلي الحجز، اشرحي للمريض إنه في تعارض "
            "برقم الهاتف وصعّدي الموضوع لموظف يتحقق ويدمج الملفين."
        )

    db.table("patients").update({"full_name": full_name, "phone": phone}).eq("id", patient_id).execute()
    return {"full_name": full_name, "phone": phone}


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

    if start_utc < now:
        # Independent of min_booking_lead_minutes, which is 0 by default and
        # then skips its own check entirely. Nothing marks a slot unavailable
        # once its time passes, so the branch keeps hundreds of past slots at
        # status='available', and book_by_doctor_and_time matches a slot on
        # (doctor, exact start_at, available) without any "not in the past"
        # filter — so a requested time from yesterday would book cleanly.
        return "هذا الوقت مضى خلاص — اختاري وقت جاي."

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


def _resolve_specialty_doctor_ids(db: Client, branch_id: str, specialty_query: str) -> set[str] | None:
    """Doctors at this branch whose specialty loosely matches the patient's
    words — mirrors find_doctors' own matching so the two tools stay
    consistent about what counts as "this specialty"."""
    query = (specialty_query or "").strip()
    if not query:
        return None
    branch_staff_ids = [
        row["staff_id"]
        for row in db.table("staff_branches").select("staff_id").eq("branch_id", branch_id).execute().data
    ]
    if not branch_staff_ids:
        return set()
    rows = (
        db.table("staff")
        .select("id, doctor_specialties(specialties(name_ar, name_en))")
        .in_("id", branch_staff_ids)
        .eq("role", "doctor")
        .execute()
        .data
    )
    matched: set[str] = set()
    for row in rows:
        specialties = [ds["specialties"] for ds in (row.get("doctor_specialties") or []) if ds.get("specialties")]
        names = [s.get("name_ar") for s in specialties] + [s.get("name_en") for s in specialties]
        if any(fuzzy_contains(name, query) for name in names):
            matched.add(row["id"])
    return matched


def search_available_slots(
    db: Client,
    branch_id: str,
    *,
    doctor_name: str | None = None,
    specialty_query: str | None = None,
    doctor_gender: str | None = None,
    doctor_language: str | None = None,
    max_price: float | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    limit: int = 8,
) -> dict:
    doctor_id = None
    if doctor_name:
        doctor_id = _resolve_doctor_id(db, branch_id, doctor_name)
        if not doctor_id:
            # Distinct from "this doctor has no free slots" — returning the
            # same empty shape for both made the model tell patients that a
            # doctor who doesn't work here is merely fully booked, which
            # invents a colleague and leaves them trying again for someone
            # who will never have availability.
            return {
                "slots": [],
                "alternative_doctors": [],
                "doctor_not_found": True,
                "error": f"ما في طبيب بهذا الاسم '{doctor_name}' بهذا الفرع — قولي للمريض صراحة إنه ما في "
                "دكتور بهالاسم عنا (لا تقولي إنه محجوز أو ما عنده مواعيد)، واستدعي find_doctors لتعرضي "
                "الأطباء الموجودين فعلاً.",
            }

    specialty_doctor_ids = _resolve_specialty_doctor_ids(db, branch_id, specialty_query) if specialty_query else None
    if specialty_doctor_ids is not None and not specialty_doctor_ids:
        return {
            "slots": [],
            "alternative_doctors": [],
            "specialty_not_found": True,
            "error": f"ما في طبيب بتخصص '{specialty_query}' بهذا الفرع — قولي للمريض إن هذا التخصص مش "
            "متوفر عنا (لا تقولي إنه ما في مواعيد)، واعرضي التخصصات الموجودة عبر find_doctors.",
        }

    branch_rows = db.table("branches").select("timezone").eq("id", branch_id).limit(1).execute().data
    tz = ZoneInfo((branch_rows[0].get("timezone") if branch_rows else None) or "Asia/Amman")
    window = _load_booking_window(db)

    def eligible(r: dict) -> bool:
        staff = r.get("staff") or {}
        if doctor_gender and staff.get("gender") != doctor_gender:
            return False
        if doctor_language and doctor_language not in (staff.get("languages") or []):
            return False
        service = r.get("services") or {}
        if max_price is not None and service.get("price") is not None and service["price"] > max_price:
            return False
        return True

    # Pull a wider page than requested since the booking-window/eligibility
    # filters below may drop some — still cheap, and far simpler than pushing
    # every one of these into the query itself.
    def run_query(*, use_doctor_id: str | None) -> list[dict]:
        q = (
            db.table("slots")
            .select(
                "id, start_at, duration_minutes, doctor_id, "
                "staff!slots_doctor_id_fkey(full_name, gender, languages), services(price)"
            )
            .eq("branch_id", branch_id)
            .eq("status", "available")
            .gte("start_at", date_from or datetime.now(timezone.utc).isoformat())
            .order("start_at")
            .limit(limit * 4)
        )
        if use_doctor_id:
            q = q.eq("doctor_id", use_doctor_id)
        elif specialty_doctor_ids is not None:
            q = q.in_("doctor_id", list(specialty_doctor_ids))
        if date_to:
            q = q.lt("start_at", date_to)

        rows = q.execute().data
        out = []
        for r in rows:
            if not eligible(r):
                continue
            start_utc = datetime.fromisoformat(r["start_at"].replace("Z", "+00:00"))
            if _window_violation_reason(window, tz, start_utc):
                continue
            service = r.get("services") or {}
            out.append(
                {
                    "slot_id": r["id"],
                    "doctor_name": (r.get("staff") or {}).get("full_name"),
                    # Clinic-local time, already converted — show this to the
                    # patient as-is, don't reinterpret or convert it again.
                    "start_at_clinic_local_time": start_utc.astimezone(tz).isoformat(),
                    "duration_minutes": r["duration_minutes"],
                    "price": service.get("price"),
                }
            )
            if len(out) >= limit:
                break
        return out

    matches = run_query(use_doctor_id=doctor_id)

    alternative_doctors: list[dict] = []
    if not matches and doctor_id:
        alternative_doctors = run_query(use_doctor_id=None)

    return {"slots": matches, "alternative_doctors": alternative_doctors}


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
        if _is_placeholder_name(current_name, patient.get("phone")):
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
    appointment = (
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
    _resolve_recalls_on_booking(db, patient_id, appointment_id)
    return appointment


def _resolve_recalls_on_booking(db: Client, patient_id: str, appointment_id: str) -> None:
    """FR-RCL-005/007: mirrors backend's resolve_recalls_on_booking (the two
    services don't share code) — marks any pending/invited recall for this
    patient as booked so they don't get a follow-up invite for something
    they already acted on. Best-effort: never blocks a real booking."""
    try:
        open_recalls = (
            db.table("recalls")
            .select("id")
            .eq("patient_id", patient_id)
            .in_("status", ["pending", "invited"])
            .execute()
            .data
        )
        now_iso = datetime.now(timezone.utc).isoformat()
        for row in open_recalls:
            db.table("recalls").update(
                {"status": "booked", "responded_at": now_iso, "resulting_appointment_id": appointment_id}
            ).eq("id", row["id"]).execute()
    except Exception:
        pass


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
        return {"booked": False, "reason": violation, "alternative_slots": alternatives["slots"]}

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
            "alternative_slots": alternatives["slots"],
        }

    slot_id = slot_rows[0]["id"]
    appointment = book_slot_for_patient(
        db, slot_id=slot_id, patient_id=patient_id, visit_for_name=visit_for_name, notes=notes
    )
    return {"booked": True, **appointment}
