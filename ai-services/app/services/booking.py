import secrets
from datetime import datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

from postgrest.exceptions import APIError
from supabase import Client

from app.services.money import tidy_amount
from app.services.text_match import digits_only, fuzzy_contains, to_ascii_digits


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

# Bounds wide enough to admit a real patient of any age without admitting
# "999" typed by mistake. Age arrives from chat as a whole number of years,
# not a birth date, so it can only ever produce an *approximate*
# date_of_birth -- accurate enough for the min_age gate in
# backend/app/routers/slots.py (which silently skips that check entirely
# when date_of_birth is null, the state every patient registered through
# this chatbot was left in before this existed), not precise enough for
# anything that needs an exact birthday.
_MIN_PLAUSIBLE_AGE = 1
_MAX_PLAUSIBLE_AGE = 120


def validate_full_name(full_name: str, patient_said: str | None = None) -> str:
    """A triple name the patient actually gave, or a clear reason why not.

    Digits are rejected outright: the AI used to be handed the phone number
    again when a patient sent both on one line, and it would happily store
    that as the name.

    patient_said is the patient's own messages. Requiring a triple name only
    by shape turned out to reward inventing one: asked to complete "سامي خالد",
    the model saved "سامي خالد الأحمد" -- a family name nobody had said, on a
    medical record. The prompt forbade exactly that and the model did it
    anyway, so the check cannot be advice. Every part has to appear in what
    the patient wrote.
    """
    name = " ".join((full_name or "").split())
    if any(ch.isdigit() for ch in name):
        raise BookingError("الاسم فيه أرقام — اطلبي الاسم الثلاثي بالحروف فقط (الاسم واسم الأب واسم العائلة).")
    parts = [p for p in name.split(" ") if len(p) > 1]
    if len(parts) < _REQUIRED_NAME_PARTS:
        raise BookingError(
            "الاسم لازم يكون ثلاثي — الاسم واسم الأب واسم العائلة. اطلبي من المريض الاسم الثلاثي كامل "
            "ولا تحفظي ناقص ولا تكملي الاسم من عندك."
        )
    if patient_said is not None:
        invented = [part for part in parts if not fuzzy_contains(patient_said, part)]
        if invented:
            raise BookingError(
                "ما حفظنا الاسم: فيه جزء منه (" + "، ".join(invented) + ") المريض ما ذكره أبداً. "
                "ممنوع تكملي الاسم من عندك — اطلبي منه يكتب اسمه الثلاثي كامل بنفسه واستنّي رده."
            )
    return name


def validate_phone(phone: str, patient_said: str | None = None) -> str:
    """Plausible as a real mobile number that the patient actually gave.

    Kept in the form the patient typed it apart from folding Arabic-Indic
    digits to ASCII, and not reformatted on purpose: dedup matches patients on
    the stored string (`.eq("phone", ...)`), and rewriting new numbers into
    +962 form while every existing row is still 07... would silently stop
    matching the same person and create duplicate patient records.

    patient_said is checked for the same reason it is checked on the name, and
    for a reason that turned out to be worse. The "not a full number" error
    below used to end with a sample number in brackets. Asked for a phone the
    patient had not given, the model lifted that sample straight out of the
    error text and saved it as the patient's number — confirmed live on a real
    Telegram booking, where the record ended up holding a number for someone
    who never typed a digit. No error message offers a number any more, and an
    invented one can no longer be stored even if it reaches here from
    somewhere else.
    """
    # Arabic-Indic digits are folded to ASCII before anything else: patients
    # type ٠٧٩... as readily as 079..., and a record holding the first cannot
    # be dialled or matched against the second.
    raw = to_ascii_digits((phone or "").strip())
    if raw.startswith("tg:"):
        raise BookingError("هذا مش رقم هاتف حقيقي — اطلبي من المريض رقم جواله.")
    digits = digits_only(raw)
    if not digits or not all(ch.isdigit() or ch in "+-() " for ch in raw):
        raise BookingError("رقم الجوال غير صحيح — اطلبي من المريض رقم جواله بالأرقام فقط.")
    if len(digits) < _MIN_PHONE_DIGITS or len(digits) > _MAX_PHONE_DIGITS:
        # Deliberately no example number here. See the docstring.
        raise BookingError("رقم الجوال غير صحيح — لازم يكون رقم جوال كامل. اطلبيه من المريض من جديد.")
    if len(set(digits)) == 1:
        raise BookingError("رقم الجوال غير صحيح — اطلبي من المريض رقم جواله الحقيقي.")
    if patient_said is not None and digits not in digits_only(patient_said):
        raise BookingError(
            "ما حفظنا الرقم: هذا الرقم المريض ما كتبه أبداً. ممنوع تحطي رقم من عندك أو من مثال — "
            "اطلبي منه يكتب رقم جواله بنفسه واستنّي رده، وما تحجزي قبل ما يبعته."
        )
    return raw


def validate_age(age: int, patient_said: str | None = None) -> int:
    """A plausible age the patient actually gave, or a clear reason why not.

    Checked against patient_said for the same reason the name and phone are:
    a model that invents "٢٥" to satisfy a required field is exactly the
    failure mode this whole module exists to block. The check is weaker here
    than for the phone (a one- or two-digit number is far more likely to
    coincidentally appear elsewhere in the conversation than a full phone
    number is), so it catches an invented age only on the same terms the
    phone check does — not a guarantee, the same tradeoff already accepted
    there.
    """
    if not isinstance(age, int) or isinstance(age, bool):
        raise BookingError("العمر لازم يكون رقم صحيح — اطلبي من المريض عمره بالأرقام.")
    if age < _MIN_PLAUSIBLE_AGE or age > _MAX_PLAUSIBLE_AGE:
        raise BookingError("هذا العمر غير منطقي — اطلبي من المريض عمره الحقيقي.")
    if patient_said is not None and str(age) not in digits_only(patient_said):
        raise BookingError(
            "ما حفظنا العمر: هذا الرقم المريض ما كتبه أبداً كعمر. ممنوع تحطي عمر من عندك — "
            "اطلبي منه يكتب عمره بنفسه واستنّي رده."
        )
    return age


def _date_of_birth_from_age(age: int) -> str:
    """An approximate date_of_birth from a whole number of years -- exact day
    and month are never knowable from age alone, so "age years before today"
    is as precise as this can be. Good enough for the min_age gate it feeds
    (backend/app/routers/slots.py), which itself only computes age in whole
    years."""
    today = datetime.now(timezone.utc).date()
    try:
        return today.replace(year=today.year - age).isoformat()
    except ValueError:
        # Feb 29, and this many years back isn't a leap year.
        return today.replace(year=today.year - age, day=28).isoformat()


def missing_contact_fields(db: Client, patient_id: str) -> list[str]:
    """Which of "name"/"phone"/"age" are still placeholders for this patient —
    booking must not proceed until name and phone are real, since without a
    real name the confirmation is unattributed and without a real phone the
    clinic has no way to reach the patient about this appointment (reminders,
    changes, payment follow-up). Age is collected the same way but doesn't
    block booking on its own (see _build_system_prompt) — a service's
    min_age gate silently no-ops without a date_of_birth on file (backend/
    app/routers/slots.py), so every patient registered through chat before
    this existed left that gate meaningless for them."""
    rows = db.table("patients").select("full_name, phone, date_of_birth").eq("id", patient_id).limit(1).execute().data
    if not rows:
        return ["name", "phone", "age"]
    patient = rows[0]
    missing = []
    if _is_placeholder_name(patient.get("full_name"), patient.get("phone")):
        missing.append("name")
    if _is_placeholder_phone(patient.get("phone")):
        missing.append("phone")
    if not patient.get("date_of_birth"):
        missing.append("age")
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


def save_contact_info(
    db: Client,
    patient_id: str,
    full_name: str | None,
    phone: str | None,
    age: int | None = None,
    patient_said: str | None = None,
) -> dict:
    """Persists the name/phone/age the patient just gave in chat, so
    missing_contact_fields stops blocking book_appointment (name/phone) or
    asking again (age). A phone that already belongs to a different patient
    record means this contact IS that other (real, already-known) patient —
    patients.phone is unique, so we physically cannot write the same number
    onto two rows anyway. Rather than block the booking and escalate to a
    human over what's almost always the same person reachable from a second
    channel (confirmed live: this is exactly what happened mid-booking to a
    real patient, who just wanted an appointment), repoint this
    conversation/channel identity to the real record and let booking
    continue under it. The abandoned placeholder patient is tombstoned the
    same way patient-merge already does it.

    full_name/phone must arrive together or not at all — same rule as
    before, just no longer the only two fields this can save. age is
    independent: a patient already known by name and phone but missing only
    their age can have it saved on its own, without re-sending the two
    fields already on file."""
    full_name = (full_name or "").strip()
    phone = (phone or "").strip()
    if bool(full_name) != bool(phone):
        raise BookingError("لازم الاسم ورقم الهاتف الاثنين مع بعض، مش وحدة بس.")
    if not full_name and not phone and age is None:
        raise BookingError("ما في شي وصلك من المريض تحفظيه فعلاً — اسم ورقم مع بعض، أو عمر.")

    updates: dict = {}
    if full_name:
        # Enforced here rather than in the prompt alone: a model that forgets
        # an instruction still cannot write a one-word name or a junk number
        # into a medical record.
        full_name = validate_full_name(full_name, patient_said)
        phone = validate_phone(phone, patient_said)
        updates["full_name"] = full_name
        updates["phone"] = phone
    if age is not None:
        updates["date_of_birth"] = _date_of_birth_from_age(validate_age(age, patient_said))

    if "phone" in updates:
        existing = db.table("patients").select("id, full_name").eq("phone", phone).neq("id", patient_id).limit(1).execute().data
        if existing:
            real_patient_id = _resolve_patient(db, existing[0]["id"])
            if "date_of_birth" in updates:
                db.table("patients").update({"date_of_birth": updates["date_of_birth"]}).eq("id", real_patient_id).execute()
            real = db.table("patients").select("full_name").eq("id", real_patient_id).limit(1).execute().data[0]
            db.table("conversations").update({"patient_id": real_patient_id}).eq("patient_id", patient_id).execute()
            db.table("patient_channel_identities").update({"patient_id": real_patient_id}).eq("patient_id", patient_id).execute()
            if patient_id != real_patient_id:
                db.table("patients").update({"is_merged_into": real_patient_id}).eq("id", patient_id).execute()
            return {"full_name": real["full_name"], "phone": phone, "patient_id": real_patient_id}

    db.table("patients").update(updates).eq("id", patient_id).execute()
    current = db.table("patients").select("full_name, phone").eq("id", patient_id).limit(1).execute().data[0]
    return {"full_name": current["full_name"], "phone": current["phone"], "patient_id": patient_id}


def pending_followups_for_patient(db: Client, patient_id: str) -> list[dict]:
    """Follow-up services this patient is due for, per service_sequences —
    e.g. a completed teeth-cleaning that recommends a check-up 30 days later.
    service_sequences has existed since the original schema but nothing ever
    read it (confirmed by grep across the whole codebase and an empty table
    live), so a patient could complete the first visit in a recommended chain
    and the assistant would never once mention the second.

    A candidate is "due" once its recommended_gap_days have passed since the
    anchor visit (or immediately, if no gap is configured), and only while
    the patient doesn't already have a live appointment for that next
    service — otherwise this would nag someone who already rebooked."""
    completed = (
        db.table("appointments")
        .select("id, service_id, scheduled_at")
        .eq("patient_id", patient_id)
        .eq("status", "completed")
        .is_("deleted_at", "null")
        .execute()
        .data
    )
    anchor_service_ids = {row["service_id"] for row in completed if row.get("service_id")}
    if not anchor_service_ids:
        return []

    sequences = (
        db.table("service_sequences")
        .select("service_id, next_service_id, is_required, recommended_gap_days, services!service_sequences_next_service_id_fkey(name)")
        .in_("service_id", list(anchor_service_ids))
        .execute()
        .data
    )
    if not sequences:
        return []

    already_booked_next = {
        row["service_id"]
        for row in db.table("appointments")
        .select("service_id, status")
        .eq("patient_id", patient_id)
        .is_("deleted_at", "null")
        .execute()
        .data
        if row.get("service_id") and row.get("status") not in _TERMINAL_APPOINTMENT_STATUSES
    }

    # The most recent completed visit for each anchor service -- the gap is
    # counted from the latest time the patient actually had it done, not the
    # first time years ago.
    latest_by_service: dict[str, str] = {}
    for row in completed:
        sid = row.get("service_id")
        if sid and (sid not in latest_by_service or row["scheduled_at"] > latest_by_service[sid]):
            latest_by_service[sid] = row["scheduled_at"]

    now = datetime.now(timezone.utc)
    due: list[dict] = []
    for seq in sequences:
        next_id = seq["next_service_id"]
        if next_id in already_booked_next:
            continue
        anchor_at = datetime.fromisoformat(latest_by_service[seq["service_id"]].replace("Z", "+00:00"))
        gap_days = seq.get("recommended_gap_days")
        if gap_days and now < anchor_at + timedelta(days=gap_days):
            continue
        due.append(
            {
                "next_service_id": next_id,
                "next_service_name": (seq.get("services") or {}).get("name"),
                "is_required": seq["is_required"],
                "recommended_gap_days": gap_days,
                "based_on_visit_at": latest_by_service[seq["service_id"]],
            }
        )
    return due


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


def _resolve_service_doctor_ids(db: Client, branch_id: str, service_query: str) -> set[str] | None:
    """Doctors at this branch who actually perform the service the patient
    named -- the same service_doctors/staff_branches path list_services uses
    to decide whether a service is offered at a branch at all, so the two
    can't disagree about it.

    Slots themselves carry no service (see _resolve_service_id: they're
    generated from doctor_availability, which has no notion of one), so
    without this the slot search is blind to what the patient came for and
    will happily offer times with a doctor who doesn't do it. Confirmed
    live: a patient chose teeth cleaning at the Zarqa branch, was offered
    9:00/9:30/10:00 with two doctors, and after picking 9:00 was told first
    that the doctor had nothing then that the service "isn't available at
    Zarqa" -- while Zarqa's Dr. Alaa Ghoneim was linked to that exact
    service the whole time.

    Returns None when no service was named (no filtering), or the set of
    matching doctor ids -- empty if this branch genuinely has nobody for it.
    """
    query = (service_query or "").strip()
    if not query:
        return None
    branch_staff_ids = {
        row["staff_id"]
        for row in db.table("staff_branches").select("staff_id").eq("branch_id", branch_id).execute().data
    }
    if not branch_staff_ids:
        return set()
    services = db.table("services").select("id, name").eq("is_active", True).is_("deleted_at", "null").execute().data
    matched_service_ids = {s["id"] for s in services if fuzzy_contains(s["name"], query)}
    if not matched_service_ids:
        return set()
    links = db.table("service_doctors").select("service_id, staff_id").execute().data
    providers = {link["staff_id"] for link in links if link["service_id"] in matched_service_ids}
    # A service nobody is linked to is clinic-wide -- list_services treats it
    # the same way, so it must not read as "unavailable" here either.
    if not providers:
        return None
    return providers & branch_staff_ids


def _branches_offering_service(db: Client, service_query: str, exclude_branch_id: str) -> list[str]:
    """Names of the branches that actually have someone linked to perform
    this service -- excluding the branch that was just found not to offer
    it, since offering it as its own alternative makes no sense.

    Without this, service_not_available_at_branch only told the model to
    "suggest another branch via list_branches", which returns every branch
    with no service filter at all -- so the model guessed among all of them.
    Confirmed live: pediatrics is only staffed at two of a clinic's four
    branches, and asked about a third, the assistant apologized correctly
    and then suggested three "other" branches, one of which (the fourth)
    doesn't have a pediatrician either -- sending the patient into the exact
    same dead end it had just apologized for."""
    query = (service_query or "").strip()
    if not query:
        return []
    services = db.table("services").select("id, name").eq("is_active", True).is_("deleted_at", "null").execute().data
    matched_service_ids = {s["id"] for s in services if fuzzy_contains(s["name"], query)}
    if not matched_service_ids:
        return []
    links = db.table("service_doctors").select("service_id, staff_id").execute().data
    providers = {link["staff_id"] for link in links if link["service_id"] in matched_service_ids}
    if not providers:
        return []
    staff_branch_rows = (
        db.table("staff_branches")
        .select("staff_id, branch_id")
        .in_("staff_id", list(providers))
        .execute()
        .data
    )
    branch_ids = {row["branch_id"] for row in staff_branch_rows if row["branch_id"] != exclude_branch_id}
    if not branch_ids:
        return []
    branch_rows = db.table("branches").select("id, name").in_("id", list(branch_ids)).execute().data
    return sorted({row["name"] for row in branch_rows})


_ARABIC_WEEKDAYS_SHORT = ["الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت", "الأحد"]


def _day_label(start_local: datetime, now_local: datetime) -> str:
    delta = (start_local.date() - now_local.date()).days
    if delta == 0:
        return "اليوم"
    if delta == 1:
        return "بكرة"
    return f"{_ARABIC_WEEKDAYS_SHORT[start_local.weekday()]} {start_local.strftime('%Y-%m-%d')}"


def _as_utc_bound(value: str | None, tz: ZoneInfo) -> str | None:
    """A date/datetime the model wrote, as a UTC instant.

    The model only ever sees clinic-local times (find_available_slots returns
    start_at_clinic_local_time), so a bound it writes back is clinic-local
    too -- but it was being compared straight against start_at, which is UTC.
    In Amman that is a three-hour shift, enough to push the end of a working
    day into the next one. A bare date means midnight local, the same reading
    a receptionist would give it.

    An unparseable value is passed through rather than raised on: a slot list
    that ignores a malformed filter is a smaller failure than one that errors
    out mid-booking."""
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(value)
    except ValueError:
        return value
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=tz)
    return parsed.astimezone(timezone.utc).isoformat()


def search_available_slots(
    db: Client,
    branch_id: str,
    *,
    doctor_name: str | None = None,
    specialty_query: str | None = None,
    service_name: str | None = None,
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

    # Resolved before the specialty check (not after, as it used to be) so a
    # named service that's genuinely offered here can override a stale
    # specialty check below -- see the comment at that check for why.
    service_doctor_ids = _resolve_service_doctor_ids(db, branch_id, service_name) if service_name else None
    if service_doctor_ids is not None and not service_doctor_ids:
        other_branches = _branches_offering_service(db, service_name, branch_id)
        if other_branches:
            branch_note = (
                "الفروع التانية اللي فعلاً بتقدم هالخدمة (تحققنا منها فعلياً، مش تخمين): "
                + "، ".join(other_branches)
                + ". اعرضي على المريض هاي الفروع بالضبط وبس — ممنوع تذكري أي فرع تاني غيرهم كبديل "
                "لهالخدمة تحديداً، حتى لو list_branches رجّع فروع إضافية."
            )
        else:
            branch_note = (
                "ولا فرع تاني عندنا بيقدم هالخدمة حالياً (تحققنا فعلياً) — ممنوع تقترحي فرع تاني كبديل "
                "لهالخدمة تحديداً، اعرضي على المريض الخدمات المتوفرة بهذا الفرع عبر list_services بدلها."
            )
        return {
            "slots": [],
            "alternative_doctors": [],
            "service_not_available_at_branch": True,
            "available_at_other_branches": other_branches,
            "error": f"خدمة '{service_name}' ما في حدا بيعملها بهذا الفرع — قولي للمريض إن الخدمة مش "
            f"متوفرة بهذا الفرع تحديداً (لا تقولي إنه ما في مواعيد). {branch_note}",
        }

    specialty_doctor_ids = _resolve_specialty_doctor_ids(db, branch_id, specialty_query) if specialty_query else None
    if specialty_doctor_ids is not None and not specialty_doctor_ids:
        if service_doctor_ids is not None:
            # A named service already resolved to real doctors at this branch
            # via service_doctors/staff_branches -- the exact same data
            # list_services' catalog uses to decide a service is offered
            # here. doctor_specialties is a separate, staff-profile-level tag
            # that can lag behind actual service assignments, so a missing
            # tag on those same doctors must not override what the clinic's
            # own service assignment already confirmed. Confirmed live: a
            # service linked to two doctors at this branch was rejected as
            # "specialty not found" because neither doctor had a matching
            # doctor_specialties row -- directly contradicting the catalog
            # that had just shown this exact service at this branch.
            specialty_doctor_ids = None
        else:
            return {
                "slots": [],
                "alternative_doctors": [],
                "specialty_not_found": True,
                "error": f"ما في طبيب بتخصص '{specialty_query}' بهذا الفرع — قولي للمريض إن هذا التخصص مش "
                "متوفر عنا (لا تقولي إنه ما في مواعيد)، واعرضي التخصصات الموجودة عبر find_doctors.",
            }

    if service_doctor_ids is not None:
        specialty_doctor_ids = (
            service_doctor_ids if specialty_doctor_ids is None else specialty_doctor_ids & service_doctor_ids
        )
        if not specialty_doctor_ids:
            return {
                "slots": [],
                "alternative_doctors": [],
                "specialty_not_found": True,
                "error": f"ما في طبيب بهذا الفرع بيجمع بين تخصص '{specialty_query}' وخدمة '{service_name}' "
                "— اسألي المريض يختار وحدة منهم بدل ما تقولي إنه ما في مواعيد.",
            }

    branch_rows = db.table("branches").select("timezone").eq("id", branch_id).limit(1).execute().data
    tz = ZoneInfo((branch_rows[0].get("timezone") if branch_rows else None) or "Asia/Amman")
    window = _load_booking_window(db)

    date_from = _as_utc_bound(date_from, tz)
    date_to = _as_utc_bound(date_to, tz)

    # Asked for "today" at 15:33 clinic time, the assistant sent
    # date_from="2026-08-10" and the two remaining slots that afternoon were
    # still returned -- but the same day filter three hours later, or any
    # narrower window the model builds out of the clinic-local times this tool
    # itself hands back, lands in the wrong day once the +03:00 offset is
    # dropped. Both ends are now read in the clinic's timezone, which is the
    # only timezone the model is ever shown.
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
                    # Which day this is, in the words the patient will hear,
                    # so the model never has to do the date arithmetic itself.
                    # It got it wrong live: it offered "اليوم 4 و4:30", the
                    # patient said 4:30, and it answered that 4:30 was not
                    # available today -- while that slot sat available in the
                    # table the whole time.
                    "day": _day_label(start_utc.astimezone(tz), datetime.now(timezone.utc).astimezone(tz)),
                    # Clinic-local time, already converted — show this to the
                    # patient as-is, don't reinterpret or convert it again.
                    "start_at_clinic_local_time": start_utc.astimezone(tz).isoformat(),
                    "duration_minutes": r["duration_minutes"],
                    "price": tidy_amount(service.get("price")),
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


def find_nearest_slot_across_branches(
    db: Client,
    *,
    exclude_branch_id: str,
    specialty_query: str | None = None,
    service_name: str | None = None,
    doctor_gender: str | None = None,
    doctor_language: str | None = None,
    max_price: float | None = None,
    limit: int = 5,
) -> dict:
    """The nearest available slots across every OTHER active branch, for when
    the current branch has none.

    search_available_slots only ever took one branch_id -- when a patient's
    current branch had nothing, the model's only way to look elsewhere was
    select_branch, which also silently switches every later query in the
    conversation to that branch (the exact bug PR #67 fixed for a name
    switch: this is the same shape, but for "just tell me the soonest
    appointment anywhere"). doctor_name is deliberately not a filter here --
    a doctor named at one branch has no meaning at another.
    """
    branches = db.table("branches").select("id, name").eq("is_active", True).execute().data
    results: list[dict] = []
    for branch in branches:
        if branch["id"] == exclude_branch_id:
            continue
        found = search_available_slots(
            db,
            branch["id"],
            specialty_query=specialty_query,
            service_name=service_name,
            doctor_gender=doctor_gender,
            doctor_language=doctor_language,
            max_price=max_price,
            limit=limit,
        )
        for slot in found["slots"]:
            results.append({**slot, "branch_id": branch["id"], "branch_name": branch["name"]})

    results.sort(key=lambda s: s["start_at_clinic_local_time"])
    return {"slots": results[:limit]}


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


# Terminal statuses no longer occupy the patient's calendar -- everything
# else (confirmed, requested, checked_in, the various pending_* states, ...)
# still represents a real commitment of their time that a second booking
# would collide with.
_TERMINAL_APPOINTMENT_STATUSES = {
    "cancelled",
    "cancelled_by_patient",
    "cancelled_by_clinic",
    "cancelled_by_doctor",
    "rejected",
    "no_show",
    "completed",
    "checked_out",
    "expired",
}


def _patient_double_booking_conflict(
    db: Client, patient_id: str, start_utc: datetime, end_utc: datetime
) -> dict | None:
    """The patient's own other appointment that overlaps this time, if any --
    a different doctor's slot search has no way to know this same patient is
    already booked elsewhere at that hour, so nothing in the slot-locking
    machinery (which only ever guards one doctor's one slot) catches this on
    its own. Confirmed live: one conversation booked the same patient into
    two appointments with two different doctors at the exact same 9:00 slot
    -- a dermatology consult and a laser session -- and both went through
    cleanly.

    A generous +/-4 hour window (appointments here run 20-90 minutes) keeps
    this to one indexed query instead of pushing interval arithmetic through
    PostgREST's filter API, which has no clean way to express it; the real
    overlap check happens in Python against that small candidate set."""
    window_start = (start_utc - timedelta(hours=4)).isoformat()
    window_end = (end_utc + timedelta(hours=4)).isoformat()
    rows = (
        db.table("appointments")
        # staff!appointments_staff_id_fkey, not bare staff(...): appointments
        # has three FKs into staff (staff_id, created_by, last_modified_by),
        # so an unqualified embed is ambiguous and PostgREST rejects the
        # query outright (PGRST201) -- confirmed live, every booking attempt
        # failed here with a generic "technical problem" apology and the
        # patient never actually got booked.
        .select("scheduled_at, duration_minutes, status, staff!appointments_staff_id_fkey(full_name), services(name)")
        .eq("patient_id", patient_id)
        .is_("deleted_at", "null")
        .gte("scheduled_at", window_start)
        .lt("scheduled_at", window_end)
        .execute()
        .data
    )
    for row in rows:
        if row.get("status") in _TERMINAL_APPOINTMENT_STATUSES:
            continue
        existing_start = datetime.fromisoformat(row["scheduled_at"].replace("Z", "+00:00"))
        existing_end = existing_start + timedelta(minutes=row["duration_minutes"])
        if existing_start < end_utc and existing_end > start_utc:
            return row
    return None


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


def _alternatives_for(
    db: Client, branch_id: str, doctor_name: str, requested_dt: datetime, tz: ZoneInfo
) -> list[dict]:
    """What to offer instead when the requested time can't be booked.

    The requested day first, since that is what the patient asked for. But
    when that day has nothing left, an empty list used to be all the model
    got, and it filled the gap itself -- live, it told a patient 4:30 wasn't
    available "today" and offered only tomorrow, while 4:00 that same
    afternoon was still free. So fall back to the doctor's next available
    slots rather than handing back nothing."""
    day_start_local = requested_dt.astimezone(tz).replace(hour=0, minute=0, second=0, microsecond=0)
    day_end_local = day_start_local.replace(hour=23, minute=59, second=59)
    same_day = search_available_slots(
        db,
        branch_id,
        doctor_name=doctor_name,
        date_from=day_start_local.isoformat(),
        date_to=day_end_local.isoformat(),
    )
    if same_day["slots"]:
        return same_day["slots"]
    return search_available_slots(db, branch_id, doctor_name=doctor_name)["slots"]


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
        return {
            "booked": False,
            "reason": violation,
            "alternative_slots": _alternatives_for(db, branch_id, doctor_name, requested_dt, tz),
        }

    slot_rows = (
        db.table("slots")
        .select("id, duration_minutes")
        .eq("branch_id", branch_id)
        .eq("doctor_id", doctor_id)
        .eq("status", "available")
        .eq("start_at", requested_utc.isoformat())
        .limit(1)
        .execute()
        .data
    )
    if not slot_rows:
        return {
            "booked": False,
            "reason": "هذا الوقت بالضبط مع هذا الطبيب مش متاح (خذه شخص ثاني للتو أو تغيّر الجدول).",
            "alternative_slots": _alternatives_for(db, branch_id, doctor_name, requested_dt, tz),
        }

    slot_id = slot_rows[0]["id"]

    # Skip this check when the booking is explicitly for someone other than
    # the messaging contact themselves (e.g. "احجزلي لابني") -- book_slot_for_
    # patient uses this exact signal to decide the same thing, so the two
    # can't disagree about whose calendar this is.
    patient_rows = db.table("patients").select("full_name, phone").eq("id", patient_id).limit(1).execute().data
    patient_row = patient_rows[0] if patient_rows else {}
    booking_for_someone_else = (
        bool(visit_for_name and visit_for_name.strip())
        and not _is_placeholder_name(patient_row.get("full_name"), patient_row.get("phone"))
        and visit_for_name.strip() != patient_row.get("full_name")
    )
    if not booking_for_someone_else:
        slot_end_utc = requested_utc + timedelta(minutes=slot_rows[0]["duration_minutes"])
        conflict = _patient_double_booking_conflict(db, patient_id, requested_utc, slot_end_utc)
        if conflict:
            conflict_start_local = datetime.fromisoformat(conflict["scheduled_at"].replace("Z", "+00:00")).astimezone(tz)
            conflict_doctor = (conflict.get("staff") or {}).get("full_name") or "طبيب آخر"
            conflict_service = (conflict.get("services") or {}).get("name") or "موعد آخر"
            return {
                "booked": False,
                "reason": f"عند المريض موعد آخر متضارب بنفس الوقت تقريباً: {conflict_service} مع "
                f"{conflict_doctor} الساعة {conflict_start_local.strftime('%H:%M')} — ما بينحجزله "
                "موعدين بنفس الوقت إلا لو كان هذا الحجز فعلاً لشخص ثاني (زي ابنه أو قريبه)، وعندها "
                "لازم تمرري visit_for_name باسم الشخص التاني صراحة. اسألي المريض يوضّح قبل ما تكملي.",
                "alternative_slots": _alternatives_for(db, branch_id, doctor_name, requested_dt, tz),
            }

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
