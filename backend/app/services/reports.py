from collections import defaultdict
from datetime import datetime, timezone

from supabase import Client

_CANCELLED_STATUSES = {"cancelled", "cancelled_by_patient", "cancelled_by_clinic", "cancelled_by_doctor"}

_NOT_IMPLEMENTED = [
    "RPT-030 (bookings by insurance company) — no insurance-network schema exists yet.",
    "RPT-029 (search-to-booking conversion rate) — patient search events aren't logged as a distinct funnel step yet.",
    "RPT-035 (future demand forecast) — deferred to the predictive-AI phase; needs real usage history to be meaningful.",
]


def _avg(values: list[float]) -> float | None:
    return round(sum(values) / len(values), 1) if values else None


def build_dashboard_report(db: Client, branch_ids: list[str] | None, date_from: str, date_to: str) -> dict:
    """FR-RPT-001..018, 020..027, 031..034: the bulk of the reporting module in
    one payload, grouped the way a dashboard would render it into cards. Every
    figure here is computed from real rows in range, following the same
    fetch-then-aggregate-in-Python convention as no_show_rate_report — nothing
    here is a SQL GROUP BY, on purpose, for consistency with the rest of the
    codebase. RPT-019/028 need a different query shape and live in their own
    functions below; RPT-029/030/035 aren't implemented (see not_implemented)."""
    appt_query = (
        db.table("appointments")
        .select(
            "id, status, source, specialty_id, service_id, staff_id, branch_id, patient_id, "
            "scheduled_at, created_at, check_in_time, consultation_start_time, completion_time, "
            "confirmation_status, no_show_flag, rescheduling_reason"
        )
        .is_("deleted_at", "null")
        .gte("scheduled_at", date_from)
        .lt("scheduled_at", date_to)
    )
    if branch_ids is not None:
        appt_query = appt_query.in_("branch_id", branch_ids)
    appts = appt_query.execute().data

    total = len(appts)
    confirmed = sum(1 for a in appts if a.get("confirmation_status") == "confirmed")
    completed = sum(1 for a in appts if a["status"] == "completed")
    cancelled = sum(1 for a in appts if a["status"] in _CANCELLED_STATUSES)
    no_show = sum(1 for a in appts if a["status"] == "no_show" or a.get("no_show_flag"))
    rescheduled = sum(1 for a in appts if a["status"] == "rescheduled")

    def rate(n: int) -> float:
        return round(n / total * 100, 1) if total else 0.0

    wait_minutes, delay_minutes, visit_minutes, lead_days = [], [], [], []
    by_specialty: dict[str, int] = defaultdict(int)
    by_service: dict[str, int] = defaultdict(int)
    by_channel: dict[str, int] = defaultdict(int)
    doctor_change_buckets: dict[str, dict[str, int]] = defaultdict(lambda: {"cancelled": 0, "rescheduled": 0})
    heatmap_buckets: dict[tuple[int, int], int] = defaultdict(int)
    patient_ids: set[str] = set()

    for a in appts:
        checked_in, consult, done = a.get("check_in_time"), a.get("consultation_start_time"), a.get("completion_time")
        scheduled, created = a.get("scheduled_at"), a.get("created_at")
        if checked_in and consult:
            wait_minutes.append((datetime.fromisoformat(consult) - datetime.fromisoformat(checked_in)).total_seconds() / 60)
        if scheduled and consult:
            delay_minutes.append(max(0.0, (datetime.fromisoformat(consult) - datetime.fromisoformat(scheduled)).total_seconds() / 60))
        if consult and done:
            visit_minutes.append((datetime.fromisoformat(done) - datetime.fromisoformat(consult)).total_seconds() / 60)
        if scheduled and created:
            lead_days.append((datetime.fromisoformat(scheduled) - datetime.fromisoformat(created)).total_seconds() / 86400)

        if a.get("specialty_id"):
            by_specialty[a["specialty_id"]] += 1
        if a.get("service_id"):
            by_service[a["service_id"]] += 1
        by_channel[a.get("source") or "unknown"] += 1

        if a.get("staff_id"):
            if a["status"] in _CANCELLED_STATUSES:
                doctor_change_buckets[a["staff_id"]]["cancelled"] += 1
            elif a["status"] == "rescheduled":
                doctor_change_buckets[a["staff_id"]]["rescheduled"] += 1

        dt = datetime.fromisoformat(scheduled)
        heatmap_buckets[(dt.weekday(), dt.hour)] += 1

        if a.get("patient_id"):
            patient_ids.add(a["patient_id"])

    new_patients = existing_patients = 0
    if patient_ids:
        patients = db.table("patients").select("id, created_at").in_("id", list(patient_ids)).execute().data
        for p in patients:
            if date_from <= p["created_at"] < date_to:
                new_patients += 1
            else:
                existing_patients += 1

    slot_query = db.table("slots").select("id, status, doctor_id, branch_id, start_at").gte("start_at", date_from).lt("start_at", date_to)
    if branch_ids is not None:
        slot_query = slot_query.in_("branch_id", branch_ids)
    slots = slot_query.execute().data

    now = datetime.now(timezone.utc)
    total_slots = len(slots)
    booked_slots = sum(1 for s in slots if s["status"] == "booked")
    unused_slots = sum(1 for s in slots if s["status"] == "available" and datetime.fromisoformat(s["start_at"]) < now)
    slot_utilization_rate = round(booked_slots / total_slots * 100, 1) if total_slots else 0.0

    doctor_buckets: dict[str, dict[str, int]] = defaultdict(lambda: {"booked": 0, "total": 0})
    branch_buckets: dict[str, dict[str, int]] = defaultdict(lambda: {"booked": 0, "total": 0})
    for s in slots:
        if s.get("doctor_id"):
            doctor_buckets[s["doctor_id"]]["total"] += 1
            if s["status"] == "booked":
                doctor_buckets[s["doctor_id"]]["booked"] += 1
        branch_buckets[s["branch_id"]]["total"] += 1
        if s["status"] == "booked":
            branch_buckets[s["branch_id"]]["booked"] += 1

    doctor_ids = list(set(doctor_buckets) | set(doctor_change_buckets))
    doctor_names: dict[str, str] = {}
    if doctor_ids:
        rows = db.table("staff").select("id, full_name").in_("id", doctor_ids).execute().data
        doctor_names = {r["id"]: r["full_name"] for r in rows}

    branch_names: dict[str, str] = {}
    if branch_buckets:
        rows = db.table("branches").select("id, name").in_("id", list(branch_buckets)).execute().data
        branch_names = {r["id"]: r["name"] for r in rows}

    specialty_names: dict[str, str] = {}
    if by_specialty:
        rows = db.table("specialties").select("id, name_ar").in_("id", list(by_specialty)).execute().data
        specialty_names = {r["id"]: r["name_ar"] for r in rows}

    service_names: dict[str, str] = {}
    if by_service:
        rows = db.table("services").select("id, name").in_("id", list(by_service)).execute().data
        service_names = {r["id"]: r["name"] for r in rows}

    def occupancy(buckets: dict[str, dict[str, int]], names: dict[str, str], id_key: str, name_key: str) -> list[dict]:
        return [
            {
                id_key: k,
                name_key: names.get(k),
                "booked": v["booked"],
                "total": v["total"],
                "rate": round(v["booked"] / v["total"] * 100, 1) if v["total"] else 0.0,
            }
            for k, v in buckets.items()
        ]

    waitlist_query = db.table("waitlist").select("id, branch_id").eq("status", "active")
    if branch_ids is not None:
        waitlist_query = waitlist_query.in_("branch_id", branch_ids)
    waitlist_count = len(waitlist_query.execute().data)

    offers = db.table("waitlist_offers").select("id, response").gte("offered_at", date_from).lt("offered_at", date_to).execute().data
    accepted_offers = sum(1 for o in offers if o["response"] == "accepted")
    cancellation_fill_rate = round(accepted_offers / cancelled * 100, 1) if cancelled else 0.0

    logs = db.table("notification_log").select("id, status").gte("created_at", date_from).lt("created_at", date_to).execute().data
    delivered = sum(1 for log in logs if log["status"] in ("sent", "delivered", "read"))
    reminder_delivery_rate = round(delivered / len(logs) * 100, 1) if logs else 0.0

    payments = (
        db.table("payments")
        .select("id, amount, currency, payment_type")
        .eq("status", "verified")
        .gte("created_at", date_from)
        .lt("created_at", date_to)
        .execute()
        .data
    )
    currency = next((p["currency"] for p in payments if p.get("currency")), "")
    revenue = sum(p["amount"] for p in payments if p["payment_type"] in ("full", "balance", "package"))
    deposits = sum(p["amount"] for p in payments if p["payment_type"] == "deposit")
    cancellation_fees = sum(p["amount"] for p in payments if p["payment_type"] == "cancellation_fee")

    refunds_total = sum(
        r["amount"]
        for r in db.table("refunds").select("id, amount").gte("processed_at", date_from).lt("processed_at", date_to).execute().data
    )

    pending_authorization = sum(1 for a in appts if a["status"] == "pending_prior_authorization")

    doctor_changes = [
        {"doctor_id": k, "doctor_name": doctor_names.get(k), **v}
        for k, v in doctor_change_buckets.items()
        if v["cancelled"] or v["rescheduled"]
    ]
    demand_heatmap = [{"day_of_week": d, "hour": h, "count": c} for (d, h), c in sorted(heatmap_buckets.items())]

    return {
        "period": {"date_from": date_from, "date_to": date_to},
        "appointments": {
            "total": total,
            "confirmed": confirmed,
            "completed": completed,
            "cancelled": cancelled,
            "no_show_rate": rate(no_show),
            "rescheduling_rate": rate(rescheduled),
            "confirmation_rate": rate(confirmed),
        },
        "timing": {
            "avg_wait_minutes": _avg(wait_minutes),
            "avg_doctor_delay_minutes": _avg(delay_minutes),
            "avg_visit_duration_minutes": _avg(visit_minutes),
            "avg_lead_time_days": _avg(lead_days),
        },
        "utilization": {
            "slot_utilization_rate": slot_utilization_rate,
            "unused_slots": unused_slots,
            "occupancy_by_doctor": occupancy(doctor_buckets, doctor_names, "doctor_id", "doctor_name"),
            "occupancy_by_branch": occupancy(branch_buckets, branch_names, "branch_id", "branch_name"),
        },
        "breakdown": {
            "by_specialty": [{"specialty_id": k, "specialty_name": specialty_names.get(k), "count": v} for k, v in by_specialty.items()],
            "by_service": [{"service_id": k, "service_name": service_names.get(k), "count": v} for k, v in by_service.items()],
            "by_channel": [{"channel": k, "count": v} for k, v in by_channel.items()],
            "new_patients": new_patients,
            "existing_patients": existing_patients,
        },
        "waitlist": {"current_count": waitlist_count, "cancellation_fill_rate": cancellation_fill_rate},
        "reminders": {"delivery_rate": reminder_delivery_rate},
        "financial": {
            "currency": currency,
            "revenue": round(revenue, 2),
            "deposits": round(deposits, 2),
            "refunds": round(refunds_total, 2),
            "cancellation_fees": round(cancellation_fees, 2),
        },
        "insurance": {"pending_authorization_count": pending_authorization},
        "doctor_changes": doctor_changes,
        "demand_heatmap": demand_heatmap,
        "not_implemented": _NOT_IMPLEMENTED,
    }


def nearest_slot_by_specialty(db: Client, branch_ids: list[str] | None) -> list[dict]:
    """FR-RPT-019: the earliest open slot per specialty, across doctors."""
    now = datetime.now(timezone.utc).isoformat()
    slot_query = db.table("slots").select("doctor_id, start_at").eq("status", "available").gte("start_at", now).order("start_at")
    if branch_ids is not None:
        slot_query = slot_query.in_("branch_id", branch_ids)
    slots = slot_query.execute().data

    doctor_ids = list({s["doctor_id"] for s in slots if s.get("doctor_id")})
    if not doctor_ids:
        return []

    ds_rows = (
        db.table("doctor_specialties")
        .select("staff_id, specialty_id, specialties(name_ar)")
        .in_("staff_id", doctor_ids)
        .execute()
        .data
    )
    doctor_to_specialties: dict[str, list[dict]] = defaultdict(list)
    for row in ds_rows:
        doctor_to_specialties[row["staff_id"]].append(
            {"id": row["specialty_id"], "name": (row.get("specialties") or {}).get("name_ar")}
        )

    nearest: dict[str, str] = {}
    names: dict[str, str] = {}
    for s in slots:  # already ordered by start_at ascending, so first hit per specialty is the nearest
        for sp in doctor_to_specialties.get(s["doctor_id"], []):
            if sp["id"] not in nearest:
                nearest[sp["id"]] = s["start_at"]
                names[sp["id"]] = sp["name"]

    return [{"specialty_id": k, "specialty_name": names.get(k), "nearest_start_at": v} for k, v in nearest.items()]


def branch_comparison_report(db: Client, branch_ids: list[str], date_from: str, date_to: str) -> list[dict]:
    """FR-RPT-034: the same core dashboard metrics, one row per branch."""
    return [{"branch_id": bid, **build_dashboard_report(db, [bid], date_from, date_to)} for bid in branch_ids]


def call_center_performance_report(db: Client, date_from: str, date_to: str) -> list[dict]:
    """FR-RPT-028: a coarse proxy — conversations assigned per call-center
    agent and how many are still open. There's no call-duration or per-call
    outcome logging yet, so this can't report AHT or resolution rate; treat
    it as a workload view, not a full performance scorecard."""
    agents = db.table("staff").select("id, full_name").eq("role", "call_center_agent").execute().data
    if not agents:
        return []
    agent_ids = [a["id"] for a in agents]
    names = {a["id"]: a["full_name"] for a in agents}

    conversations = (
        db.table("conversations")
        .select("id, assigned_staff_id, status")
        .in_("assigned_staff_id", agent_ids)
        .gte("created_at", date_from)
        .lt("created_at", date_to)
        .execute()
        .data
    )
    buckets: dict[str, dict[str, int]] = defaultdict(lambda: {"total": 0, "open": 0})
    for c in conversations:
        buckets[c["assigned_staff_id"]]["total"] += 1
        if c["status"] == "open":
            buckets[c["assigned_staff_id"]]["open"] += 1

    return [
        {"staff_id": k, "staff_name": names.get(k), "assigned_conversations": v["total"], "still_open": v["open"]}
        for k, v in buckets.items()
    ]
