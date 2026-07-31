from collections import defaultdict
from datetime import datetime, timedelta, timezone

from supabase import Client

from app.services.scheduling import no_show_rate_report

_ACTIVE_STATUSES = (
    "requested", "confirmed", "patient_confirmed", "checked_in", "arrived_late", "waiting",
    "called", "in_consultation", "procedure_started",
)
_NOT_YET_ARRIVED_STATUSES = ("requested", "confirmed", "patient_confirmed")
_DOCTOR_LATE_GRACE_MINUTES = 15
_PATIENT_LATE_GRACE_MINUTES = 15
_SLOT_IDLE_SOON_HOURS = 2
_HIGH_NO_SHOW_RATE_THRESHOLD = 20.0
_WAITLIST_GROWTH_THRESHOLD = 10

_NOT_IMPLEMENTED = [
    "FR-ALT-007 (insurance card expiry) — no insurance schema exists yet.",
    "FR-ALT-010 (appointment missing a required resource) — services don't record which resource type they require.",
    "FR-ALT-016 (external booking system sync failure) — no external scheduling system is integrated yet.",
]


def _alert(alert_type: str, severity: str, message: str, **extra) -> dict:
    return {"type": alert_type, "severity": severity, "message": message, **extra}


def get_active_alerts(db: Client, branch_ids: list[str] | None, now: datetime | None = None) -> dict:
    """FR-ALT-001..018: computes every alert condition live from current
    data rather than storing/polling a separate alerts table — each check
    below is its own honest query against real rows, following the same
    fetch-then-evaluate-in-Python convention as the reports module. A few
    conditions (see not_implemented) can't be checked yet because the
    underlying data isn't captured anywhere in the schema."""
    now = now or datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    tomorrow_end = today_start + timedelta(days=2)
    soon_cutoff = now + timedelta(hours=48)

    appt_query = (
        db.table("appointments")
        .select(
            "id, branch_id, staff_id, patient_id, status, scheduled_at, duration_minutes, room_id, "
            "visit_type_id, confirmation_status, payment_status, check_in_time, consultation_start_time"
        )
        .is_("deleted_at", "null")
        .gte("scheduled_at", today_start.isoformat())
        .lt("scheduled_at", tomorrow_end.isoformat())
    )
    if branch_ids is not None:
        appt_query = appt_query.in_("branch_id", branch_ids)
    appts = appt_query.execute().data

    alerts: list[dict] = []

    # FR-ALT-001: double booking — same doctor, overlapping active appointments.
    by_doctor: dict[str, list[dict]] = defaultdict(list)
    for a in appts:
        if a.get("staff_id") and a["status"] in _ACTIVE_STATUSES:
            by_doctor[a["staff_id"]].append(a)
    for doctor_id, doctor_appts in by_doctor.items():
        doctor_appts.sort(key=lambda a: a["scheduled_at"])
        for i in range(len(doctor_appts) - 1):
            first, second = doctor_appts[i], doctor_appts[i + 1]
            first_end = datetime.fromisoformat(first["scheduled_at"]) + timedelta(minutes=first["duration_minutes"])
            if datetime.fromisoformat(second["scheduled_at"]) < first_end:
                alerts.append(
                    _alert(
                        "double_booking", "critical", "يوجد تعارض حجز لنفس الطبيب في نفس الوقت تقريباً.",
                        doctor_id=doctor_id, appointment_ids=[first["id"], second["id"]],
                    )
                )

    # FR-ALT-002: doctor absence — an active leave overlapping today/tomorrow.
    leaves = (
        db.table("doctor_leaves")
        .select("id, staff_id, start_at, end_at, reason")
        .lt("start_at", tomorrow_end.isoformat())
        .gt("end_at", today_start.isoformat())
        .execute()
        .data
    )
    for leave in leaves:
        alerts.append(
            _alert(
                "doctor_absence", "warning", "يوجد طبيب غائب اليوم أو غداً حسب جدول الإجازات.",
                doctor_id=leave["staff_id"], leave_id=leave["id"], start_at=leave["start_at"], end_at=leave["end_at"],
            )
        )

    # FR-ALT-003: doctor lateness — patient already waiting well past scheduled time.
    for a in appts:
        if a["status"] not in ("waiting", "called") or a.get("consultation_start_time"):
            continue
        scheduled = datetime.fromisoformat(a["scheduled_at"])
        if now - scheduled >= timedelta(minutes=_DOCTOR_LATE_GRACE_MINUTES):
            alerts.append(
                _alert(
                    "doctor_lateness", "warning", "الطبيب متأخر عن مريض ينتظر منذ أكثر من الوقت المسموح.",
                    appointment_id=a["id"], doctor_id=a.get("staff_id"),
                    minutes_late=round((now - scheduled).total_seconds() / 60),
                )
            )

    # FR-ALT-004: patient hasn't confirmed and the visit is coming up soon.
    for a in appts:
        if a.get("confirmation_status") == "pending" and a["status"] not in ("cancelled", "cancelled_by_patient", "cancelled_by_clinic", "cancelled_by_doctor"):
            alerts.append(
                _alert(
                    "patient_unconfirmed", "info", "مريض لم يؤكد موعده القادم.",
                    appointment_id=a["id"], scheduled_at=a["scheduled_at"],
                )
            )

    # FR-ALT-005: patient record missing required demographic fields.
    patient_ids = list({a["patient_id"] for a in appts if a.get("patient_id")})
    incomplete_patients: dict[str, dict] = {}
    if patient_ids:
        patients = db.table("patients").select("id, full_name, date_of_birth, gender").in_("id", patient_ids).execute().data
        for p in patients:
            if not p.get("date_of_birth") or not p.get("gender"):
                incomplete_patients[p["id"]] = p
    for a in appts:
        if a.get("patient_id") in incomplete_patients:
            alerts.append(
                _alert(
                    "incomplete_patient_form", "info", "بيانات المريض ناقصة (تاريخ ميلاد أو جنس) قبل موعد قريب.",
                    appointment_id=a["id"], patient_id=a["patient_id"],
                )
            )

    # FR-ALT-006: deposit still unpaid close to the visit.
    for a in appts:
        if a.get("payment_status") in ("unpaid", "pending") and a["status"] in _ACTIVE_STATUSES:
            alerts.append(
                _alert(
                    "deposit_unpaid", "warning", "لم يتم دفع العربون بعد لموعد قريب.",
                    appointment_id=a["id"], scheduled_at=a["scheduled_at"],
                )
            )

    # FR-ALT-008: prior authorization requested but never issued.
    for a in appts:
        if a["status"] == "pending_prior_authorization":
            alerts.append(_alert("approval_not_issued", "warning", "لم تصدر موافقة التأمين المسبقة بعد.", appointment_id=a["id"]))

    # FR-ALT-009: in-person appointment with no room assigned.
    visit_types = {v["id"]: v["code"] for v in db.table("visit_types").select("id, code").execute().data}
    for a in appts:
        if a["status"] in _ACTIVE_STATUSES and not a.get("room_id") and visit_types.get(a.get("visit_type_id")) == "in_person":
            alerts.append(_alert("appointment_without_room", "warning", "موعد حضوري بدون غرفة مخصصة.", appointment_id=a["id"]))

    # FR-ALT-011: waitlist growing past a manageable size.
    waitlist_query = db.table("waitlist").select("id, branch_id, service_id").eq("status", "active")
    if branch_ids is not None:
        waitlist_query = waitlist_query.in_("branch_id", branch_ids)
    waitlist_rows = waitlist_query.execute().data
    waitlist_by_branch: dict[str, int] = defaultdict(int)
    for w in waitlist_rows:
        waitlist_by_branch[w["branch_id"]] += 1
    for branch_id, count in waitlist_by_branch.items():
        if count > _WAITLIST_GROWTH_THRESHOLD:
            alerts.append(_alert("waitlist_growth", "info", "قائمة الانتظار كبرت بشكل ملحوظ بهذا الفرع.", branch_id=branch_id, count=count))

    # FR-ALT-012: a doctor's no-show rate over the trailing 30 days is high.
    trailing_from = (now - timedelta(days=30)).isoformat()
    for row in no_show_rate_report(db, branch_ids, "doctor", trailing_from, now.isoformat()):
        if row["total"] >= 5 and row["rate"] > _HIGH_NO_SHOW_RATE_THRESHOLD:
            alerts.append(
                _alert(
                    "high_no_show_rate", "warning", "نسبة عدم الحضور مرتفعة لدى طبيب خلال آخر 30 يوم.",
                    doctor_id=row["key"], rate=row["rate"], total=row["total"],
                )
            )

    # FR-ALT-013: an available slot is about to expire unused.
    slot_query = (
        db.table("slots")
        .select("id, branch_id, doctor_id, start_at")
        .eq("status", "available")
        .gte("start_at", now.isoformat())
        .lt("start_at", (now + timedelta(hours=_SLOT_IDLE_SOON_HOURS)).isoformat())
    )
    if branch_ids is not None:
        slot_query = slot_query.in_("branch_id", branch_ids)
    for s in slot_query.execute().data:
        alerts.append(
            _alert(
                "slot_idle_soon", "info", "يوجد Slot فارغ بعد وقت قصير قد يضيع بدون حجز.",
                slot_id=s["id"], branch_id=s["branch_id"], doctor_id=s.get("doctor_id"), start_at=s["start_at"],
            )
        )

    # FR-ALT-014: patient hasn't shown up and the grace period has passed.
    for a in appts:
        if a["status"] not in _NOT_YET_ARRIVED_STATUSES or a.get("check_in_time"):
            continue
        scheduled = datetime.fromisoformat(a["scheduled_at"])
        if now - scheduled >= timedelta(minutes=_PATIENT_LATE_GRACE_MINUTES):
            alerts.append(
                _alert(
                    "patient_not_arrived", "warning", "مريض لم يصل بعد تجاوز موعده المحدد.",
                    appointment_id=a["id"], minutes_late=round((now - scheduled).total_seconds() / 60),
                )
            )

    # FR-ALT-015: recent notification delivery failures.
    failed_notifications = (
        db.table("notification_log")
        .select("id, appointment_id, channel_type, error_message")
        .eq("status", "failed")
        .gte("created_at", (now - timedelta(hours=24)).isoformat())
        .execute()
        .data
    )
    for n in failed_notifications:
        alerts.append(
            _alert(
                "message_send_failure", "warning", "فشل إرسال رسالة/تذكير خلال آخر 24 ساعة.",
                notification_id=n["id"], appointment_id=n.get("appointment_id"), channel_type=n.get("channel_type"),
            )
        )

    # FR-ALT-017: unreviewed duplicate-patient matches.
    duplicates = db.table("patient_duplicates").select("id, patient_a_id, patient_b_id, match_score").eq("status", "pending").execute().data
    for d in duplicates:
        alerts.append(
            _alert(
                "duplicate_patient_data", "info", "يوجد اشتباه ببيانات مريض مكررة لم تتم مراجعته.",
                duplicate_id=d["id"], patient_a_id=d["patient_a_id"], patient_b_id=d["patient_b_id"], match_score=d["match_score"],
            )
        )

    # FR-ALT-018: today's bookings exceeded a branch's configured daily capacity.
    today_only_end = today_start + timedelta(days=1)
    todays_counts: dict[str, int] = defaultdict(int)
    for a in appts:
        if a["status"] in _ACTIVE_STATUSES and today_start.isoformat() <= a["scheduled_at"] < today_only_end.isoformat():
            todays_counts[a["branch_id"]] += 1
    branch_capacity_query = db.table("branches").select("id, name, daily_capacity")
    if branch_ids is not None:
        branch_capacity_query = branch_capacity_query.in_("id", branch_ids)
    for b in branch_capacity_query.execute().data:
        capacity = b.get("daily_capacity")
        count = todays_counts.get(b["id"], 0)
        if capacity and count > capacity:
            alerts.append(
                _alert(
                    "branch_capacity_exceeded", "critical", "تجاوز عدد حجوزات اليوم الطاقة الاستيعابية المحددة للفرع.",
                    branch_id=b["id"], branch_name=b.get("name"), count=count, capacity=capacity,
                )
            )

    return {"alerts": alerts, "not_implemented": _NOT_IMPLEMENTED}
