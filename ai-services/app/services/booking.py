import secrets
from datetime import datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

from postgrest.exceptions import APIError
from supabase import Client

from app.services.text_match import fuzzy_contains


class BookingError(Exception):
    pass


def looks_like_a_full_name(name: str | None) -> bool:
    """The test validate_full_name applies, as a predicate that doesn't raise."""
    if not name or any(ch.isdigit() for ch in name):
        return False
    return len([p for p in name.split() if len(p) > 1]) >= _REQUIRED_NAME_PARTS


def _is_placeholder_name(name: str | None, phone: str | None) -> bool:
    """A patient record's full_name is auto-filled at first contact (Telegram
    display name, or the phone/synthetic id itself when no display name was
    sent) — this tells apart a name the patient actually gave us from one we
    made up to satisfy the not-null column.

    A one- or two-part display name counts as made-up too. WhatsApp supplies a
    real phone number alongside it, so a patient arriving as "Sami" cleared
    both checks and could book without ever being asked for the triple name
    the medical record needs -- the gate existed but nothing reached it.
    """
    if not name or name.startswith("tg:") or name == phone:
        return True
    return not looks_like_a_full_name(name)


def _is_placeholder_phone(phone: str | None) -> bool:
    """A synthetic 'tg:{chat_id}' value (still sent by n8n's legacy Telegram
    workflows) satisfies the patients.phone NOT NULL/unique constraint but
    isn't a number anyone can actually be called or texted on."""
    return not phone or phone.startswith("tg:")


# The clinic wants a triple name (given + father + family), the norm on any
# Arabic medical record and what makes two "محمد" apart at the front desk.
_REQUIRED_NAME_PARTS = 3

# Deliberately not Jordan-only: live records already include Egyptian and
# Palestinian numbers, and rejecting a real patient is worse than accepting a
# foreign format. This only rules out what cannot be a phone number at all --
# "00800080" (8 digits) was accepted and stored before this existed.
_MIN_PHONE_DIGITS = 9
_MAX_PHONE_DIGITS = 15


def validate_full_name(full_name: str) -> str:
    """A triple name, or a clear reason why it isn't one.

    Digits are rejected outright: the AI used to be handed the phone number
    again when a patient sent both on one line, and it would happily store
    that as the name."""
    name = " ".join((full_name or "").split())
    if any(ch.isdigit() for ch in name):
        raise BookingError("الاسم فيه أرقام — اطلبي الاسم الثلاثي بالحروف فقط (الاسم واسم الأب واسم العائلة).")
    parts = [p for p in name.split(" ") if len(p) > 1]
    if len(parts) < _REQUIRED_NAME_PARTS:
        raise BookingError(
            "الاسم لازم يكون ثلاثي — الاسم واسم الأب واسم العائلة. اطلبي من المريض الاسم الثلاثي كامل "
            "ولا تحفظي ناقص ولا تكملي الاسم من عندك."
        )
    return name


def validate_phone(phone: str) -> str:
    """Plausible as a real mobile number, kept in the exact form the patient
    typed it.

    Not normalised on purpose: dedup matches patients on the stored string
    (`.eq("phone", ...)`), and rewriting new numbers into +962 form while
    every existing row is still 07... would silently stop matching the same
    person and create duplicate patient records."""
    raw = (phone or "").strip()
    if raw.startswith("tg:"):
        raise BookingError("هذا مش رقم هاتف حقيقي — اطلبي من المريض رقم جواله.")
    digits = "".join(ch for ch in raw if ch.isdigit())
    if not digits or not all(ch.isdigit() or ch in "+-() " for ch in raw):
        raise BookingError("رقم الجوال غير صحيح — اطلبي من المريض رقم جواله بالأرقام فقط.")
    if len(digits) < _MIN_PHONE_DIGITS or len(digits) > _MAX_PHONE_DIGITS:
        raise BookingError(
            "رقم الجوال غير صحيح — لازم يكون رقم جوال كامل (مثال: 0791234567). اطلبيه من المريض من جديد."
        )
    if len(set(digits)) == 1:
        raise BookingError("رقم الجوال غير صحيح — اطلبي من المريض رقم جواله الحقيقي.")
    return raw


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


def _resolve_patient(db: Client, patient_id: str) -> str:
    """Follows an is_merged_into chain to the record that's actually live —
    a phone match can land on a patient who was themselves already merged
    into someone else."""
    seen = set()
    current_id = patient_id
    while current_id not in seen:
        seen.add(current_id)
        rows = db.table("patients").select("id, is_merged_into").eq("id", current_id).limit(1).execute().data
        if not rows or not rows[0].get("is_merged_into"):
            return current_id
        current_id = rows[0]["is_merged_into"]
    return current_id


def save_contact_info(db: Client, patient_id: str, full_name: str, phone: str) -> dict:
    """Persists the name/phone the patient just gave in chat, so
    missing_contact_fields stops blocking book_appointment. A phone that
    already belongs to a different patient record means this contact IS that
    other (real, already-known) patient — patients.phone is unique, so we
    physically cannot write the same number onto two rows anyway. Rather
    than block the booking and escalate to a human over what's almost always
    the same person reachable from a second channel (confirmed live: this
    is exactly what happened mid-booking to a real patient, who just wanted
    an appointment), repoint this conversation/channel identity to the real
    record and let booking continue under it. The abandoned placeholder
    patient is tombstoned the same way patient-merge already does it."""
    full_name = (full_name or "").strip()
    phone = (phone or "").strip()
    if not full_name or not phone:
        raise BookingError("لازم الاسم ورقم الهاتف الاثنين مع بعض، مش وحدة بس.")
    # Enforced here rather than in the prompt alone: a model that forgets an
    # instruction still cannot write a one-word name or a junk number into a
    # medical record.
    full_name = validate_full_name(full_name)
    phone = validate_phone(phone)

    existing = db.table("patients").select("id, full_name").eq("phone", phone).neq("id", patient_id).limit(1).execute().data
    if existing:
        real_patient_id = _resolve_patient(db, existing[0]["id"])
        real = db.table("patients").select("full_name").eq("id", real_patient_id).limit(1).execute().data[0]
        db.table("conversations").update({"patient_id": real_patient_id}).eq("patient_id", patient_id).execute()
        db.table("patient_channel_identities").update({"patient_id": real_patient_id}).eq("patient_id", patient_id).execute()
        if patient_id != real_patient_id:
            db.table("patients").update({"is_merged_into": real_patient_id}).eq("id", patient_id).execute()
        return {"full_name": real["full_name"], "phone": phone, "patient_id": real_patient_id}

    db.table("patients").update({"full_name": full_name, "phone": phone}).eq("id", patient_id).execute()
    return {"full_name": full_name, "phone": phone, "patient_id": patient_id}


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


def _resolve_service_id(db: Client, doctor_id: str, service_name: str | None) -> str | None:
    """Slots carry no service_id at all (generate_slots_for_doctor creates
    them from doctor_availability, which has no notion of "which service"),
    so every appointment booked through the slots engine — AI chat and the
    dashboard's own slot search alike — ended up with service_id=None
    regardless of what the patient actually asked for. Confirmed live: an
    invoice issued for a real completed AI-booked visit came back with
    subtotal=0, and deposit requests never fire either, since both read
    price/deposit_amount off appointments.services(...). Fuzzy-matches the
    name the patient gave against services this doctor actually offers
    first, falling back to any active service by that name."""
    if not service_name or not service_name.strip():
        return None
    query = service_name.strip()

    linked_ids = {r["service_id"] for r in db.table("service_doctors").select("service_id").eq("staff_id", doctor_id).execute().data}
    candidates = db.table("services").select("id, name").eq("is_active", True).is_("deleted_at", "null").execute().data
    doctor_candidates = [c for c in candidates if c["id"] in linked_ids] if linked_ids else []

    for pool in (doctor_candidates, candidates):
        matches = [c for c in pool if fuzzy_contains(c["name"], query)]
        if matches:
            return matches[0]["id"]
    return None


def resolve_service_id_by_name(db: Client, service_name: str | None) -> str | None:
    """Same fuzzy match as _resolve_service_id but without a doctor to scope
    to -- used by check_patient_benefits, which can run before a doctor is
    even chosen."""
    if not service_name or not service_name.strip():
        return None
    query = service_name.strip()
    candidates = db.table("services").select("id, name").eq("is_active", True).is_("deleted_at", "null").execute().data
    matches = [c for c in candidates if fuzzy_contains(c["name"], query)]
    return matches[0]["id"] if matches else None


def active_packages_for_patient(db: Client, patient_id: str, service_id: str | None = None) -> list[dict]:
    """Active, non-expired, unspent patient packages -- what the AI should
    offer as "book against this instead of paying". A package with no rows
    in package_services applies to any service. Mirrors backend's
    active_packages_for_patient (backend/app/services/packages.py) -- the two
    services don't share code."""
    now = datetime.now(timezone.utc).isoformat()
    rows = (
        db.table("patient_packages")
        .select("id, package_id, sessions_remaining, expires_at, packages(name, package_services(service_id))")
        .eq("patient_id", patient_id)
        .eq("status", "active")
        .gt("sessions_remaining", 0)
        .gte("expires_at", now)
        .order("expires_at")
        .execute()
        .data
    )
    if not service_id:
        return rows
    matching = []
    for row in rows:
        service_ids = [ps["service_id"] for ps in (row.get("packages") or {}).get("package_services", [])]
        if not service_ids or service_id in service_ids:
            matching.append(row)
    return matching


def purchasable_packages(db: Client, service_id: str | None = None) -> list[dict]:
    """The packages the clinic sells, as opposed to the ones a patient already
    owns.

    active_packages_for_patient answers "can you book against something you
    already bought". Nothing answered "we sell a 5-session bundle that would
    be cheaper than paying per visit", so the assistant could never offer one
    -- the same gap coupons had.

    A package with no rows in package_services covers any service.
    """
    rows = (
        db.table("packages")
        .select("id, name, sessions_count, price, validity_days, package_services(service_id)")
        .eq("is_active", True)
        .order("price")
        .execute()
        .data
    )
    if not service_id:
        return rows
    return [
        row
        for row in rows
        if not {ps["service_id"] for ps in (row.get("package_services") or [])}
        or service_id in {ps["service_id"] for ps in (row.get("package_services") or [])}
    ]


def package_services_of(package: dict) -> set[str]:
    return {ps["service_id"] for ps in (package.get("package_services") or [])}


def coupon_services_of(coupon: dict) -> set[str]:
    """The services a coupon is limited to; empty means every service.

    coupon_services is the group form. coupons.service_id is the older
    single-service column, folded in so a coupon created before the group
    table keeps the scope it was created with.
    """
    ids = {link["service_id"] for link in (coupon.get("coupon_services") or [])}
    if coupon.get("service_id"):
        ids.add(coupon["service_id"])
    return ids


def coupon_covers_service(coupon: dict, service_id: str) -> bool:
    allowed = coupon_services_of(coupon)
    return not allowed or service_id in allowed


def active_coupons_for_branch(db: Client, branch_id: str, service_id: str | None = None) -> list[dict]:
    """Coupons the AI can proactively mention while booking -- active, within
    date range, not globally exhausted, and not scoped to a different branch
    or service than this booking."""
    now = datetime.now(timezone.utc).isoformat()
    rows = (
        db.table("coupons")
        .select("id, code, discount_type, discount_value, branch_id, service_id, valid_to, max_uses, used_count, coupon_services(service_id)")
        .eq("is_active", True)
        .execute()
        .data
    )
    out = []
    for c in rows:
        if c.get("branch_id") and c["branch_id"] != branch_id:
            continue
        if service_id and not coupon_covers_service(c, service_id):
            continue
        valid_to = c.get("valid_to")
        if valid_to and valid_to < now:
            continue
        # A code the patient can no longer redeem is worse than saying nothing:
        # it is offered, then refused at checkout.
        if c.get("max_uses") is not None and (c.get("used_count") or 0) >= c["max_uses"]:
            continue
        out.append(c)
    return out


def apply_coupon_code(db: Client, payment_id: str, code: str, patient_id: str) -> dict:
    """Self-contained copy of backend's apply_coupon (backend/app/services/
    payments.py) -- ai-services has its own direct DB access and no shared
    Python import path to the backend service."""
    payment = (
        db.table("payments")
        .select("*, appointments(branch_id, service_id)")
        .eq("id", payment_id)
        .limit(1)
        .execute()
        .data
    )
    if not payment:
        raise BookingError("ما لقيت دفعة مرتبطة لتطبيق الكوبون عليها.")
    payment = payment[0]
    if payment["status"] != "pending":
        raise BookingError("ما بقدر أطبّق كوبون على دفعة تم التعامل معها خلاص.")

    coupon = db.table("coupons").select("*").eq("code", code).eq("is_active", True).limit(1).execute().data
    if not coupon:
        raise BookingError("هذا الكود مش كوبون صالح.")
    coupon = coupon[0]

    now_dt = datetime.now(timezone.utc)
    if coupon.get("valid_from") and now_dt < datetime.fromisoformat(coupon["valid_from"]):
        raise BookingError("هذا الكوبون لسا ما بدأ.")
    if coupon.get("valid_to") and now_dt > datetime.fromisoformat(coupon["valid_to"]):
        raise BookingError("انتهت صلاحية هذا الكوبون.")
    if coupon.get("max_uses") is not None and coupon["used_count"] >= coupon["max_uses"]:
        raise BookingError("استُنفد عدد مرات استخدام هذا الكوبون.")

    appt = payment.get("appointments") or {}
    if coupon.get("branch_id") and appt.get("branch_id") and coupon["branch_id"] != appt["branch_id"]:
        raise BookingError("هذا الكوبون غير صالح لهذا الفرع.")
    if appt.get("service_id"):
        links = db.table("coupon_services").select("service_id").eq("coupon_id", coupon["id"]).execute().data
        if not coupon_covers_service({**coupon, "coupon_services": links}, appt["service_id"]):
            raise BookingError("هذا الكوبون غير صالح لهذه الخدمة.")

    if coupon["customer_scope"] != "all":
        prior_visit = (
            db.table("appointments")
            .select("id")
            .eq("patient_id", patient_id)
            .in_("status", ["completed", "checked_in", "checked_out", "confirmed"])
            .limit(1)
            .execute()
            .data
        )
        is_existing = bool(prior_visit)
        if coupon["customer_scope"] == "new" and is_existing:
            raise BookingError("هذا الكوبون لعملاء جدد بس.")
        if coupon["customer_scope"] == "existing" and not is_existing:
            raise BookingError("هذا الكوبون للعملاء الحاليين بس.")

    if coupon.get("per_customer_limit") is not None:
        redemptions = (
            db.table("coupon_redemptions")
            .select("id")
            .eq("coupon_id", coupon["id"])
            .eq("patient_id", patient_id)
            .execute()
            .data
        )
        if len(redemptions) >= coupon["per_customer_limit"]:
            raise BookingError("استخدمتي هذا الكوبون أقصى عدد مرات مسموح فيها إلك.")

    if coupon["discount_type"] == "fixed":
        new_amount = max(payment["amount"] - coupon["discount_value"], 0)
    elif coupon["discount_type"] == "percentage":
        new_amount = max(payment["amount"] - payment["amount"] * coupon["discount_value"] / 100, 0)
    elif coupon["discount_type"] in ("free_session", "free_consultation"):
        new_amount = 0
    else:
        new_amount = payment["amount"]

    updated = (
        db.table("payments")
        .update({"amount": new_amount, "coupon_id": coupon["id"]})
        .eq("id", payment_id)
        .execute()
        .data[0]
    )
    db.table("coupons").update({"used_count": coupon["used_count"] + 1}).eq("id", coupon["id"]).execute()
    db.table("coupon_redemptions").insert(
        {"coupon_id": coupon["id"], "patient_id": patient_id, "payment_id": payment_id}
    ).execute()
    return updated


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
    service_id: str | None = None,
    patient_package_id: str | None = None,
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
    updates = {
        "appointment_number": _generate_appointment_number(),
        "confirmation_code": _generate_confirmation_code(),
    }
    if service_id:
        # The slot itself never carried a service_id (see _resolve_service_id)
        # -- this is the only place it gets attached, so invoicing/deposit
        # logic downstream can actually find a price for this visit.
        updates["service_id"] = service_id
    if patient_package_id:
        updates["patient_package_id"] = patient_package_id
    appointment = db.table("appointments").update(updates).eq("id", appointment_id).execute().data[0]
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
    service_name: str | None = None,
    patient_package_id: str | None = None,
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
    service_id = _resolve_service_id(db, doctor_id, service_name)

    verified_package_id = None
    if patient_package_id:
        # Trust nothing the model passes without checking it against this
        # patient's own active packages -- a hallucinated or stale id here
        # would otherwise silently skip billing for a real visit.
        candidates = active_packages_for_patient(db, patient_id, service_id)
        if any(p["id"] == patient_package_id for p in candidates):
            verified_package_id = patient_package_id

    appointment = book_slot_for_patient(
        db,
        slot_id=slot_id,
        patient_id=patient_id,
        visit_for_name=visit_for_name,
        notes=notes,
        service_id=service_id,
        patient_package_id=verified_package_id,
    )
    return {"booked": True, **appointment}
