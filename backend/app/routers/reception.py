"""The front desk's own view of a branch.

Sibling to ``/me``, and deliberately not part of it: ``/me`` answers "…for me",
this answers "…for the branch I'm standing in". Mixing the two would blur the
one distinction the scoping layer exists to keep sharp.

Reception's day is a single loop — see who's due, greet them, check them in,
watch the queue absorb them. Doing that from the admin screens meant the
appointments table for the first half and the queue screen for the second,
with a patient lookup in between. Both halves are assembled here in one
response, names already resolved.
"""

from datetime import date as date_type
from datetime import datetime, time, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from supabase import Client

from app.core.auth import CurrentStaff, allowed_branch_ids, assert_branch_access, require_permission
from app.core.database import get_supabase
from app.core.scoping import StaffScope, get_staff_scope
from app.models.schemas import DeskArrival, ReceptionDesk

router = APIRouter(prefix="/reception", tags=["reception"])

# A visit that's over, or called off, isn't something the desk still expects.
_SETTLED_STATUSES = {
    "completed", "checked_out", "cancelled", "cancelled_by_patient", "cancelled_by_clinic",
    "cancelled_by_doctor", "rejected", "no_show", "expired",
}


def _name_map(db: Client, table: str, ids: set, column: str = "name") -> dict:
    ids = {i for i in ids if i}
    if not ids:
        return {}
    rows = db.table(table).select(f"id, {column}").in_("id", list(ids)).execute().data
    return {r["id"]: r[column] for r in rows}


def _resolve_branch(current: CurrentStaff, scope: StaffScope, branch_id: str | None) -> str | None:
    """Which branch this desk is standing at.

    An explicit branch_id is honoured after an access check. Otherwise fall
    back to the caller's own assignment — a receptionist works at one desk, and
    making them pick it from a dropdown every morning is friction for nothing.
    Returns None only when neither is available, which the caller renders as an
    empty desk rather than an error.
    """
    if branch_id:
        assert_branch_access(current, "appointment.view", branch_id)
        return branch_id
    own = scope.branch_ids()
    if own:
        return own[0]
    allowed = allowed_branch_ids(current, "appointment.view")
    return allowed[0] if allowed else None


@router.get("/desk", response_model=ReceptionDesk)
def desk(
    branch_id: str | None = None,
    day: date_type | None = Query(default=None, alias="date"),
    current: CurrentStaff = Depends(require_permission("appointment.view")),
    scope: StaffScope = Depends(get_staff_scope),
    db: Client = Depends(get_supabase),
):
    day = day or datetime.now(timezone.utc).date()
    resolved = _resolve_branch(current, scope, branch_id)
    result = ReceptionDesk(date=day, branch_id=resolved)
    if not resolved:
        return result

    start = datetime.combine(day, time.min, tzinfo=timezone.utc)
    appointments = (
        db.table("appointments")
        .select("id, scheduled_at, duration_minutes, status, patient_id, staff_id, service_id, confirmation_code")
        .eq("branch_id", resolved)
        .is_("deleted_at", "null")
        .gte("scheduled_at", start.isoformat())
        .lt("scheduled_at", (start + timedelta(days=1)).isoformat())
        .order("scheduled_at")
        .execute()
        .data
    )

    # The queue side of the same loop: a ticket exists once someone is checked
    # in, and carries the number the desk reads out.
    queues = (
        db.table("queues")
        .select("id")
        .eq("branch_id", resolved)
        .eq("queue_date", day.isoformat())
        .eq("is_active", True)
        .execute()
        .data
    )
    tickets = (
        db.table("queue_tickets")
        .select("appointment_id, ticket_number, status")
        .in_("queue_id", [q["id"] for q in queues])
        .execute()
        .data
        if queues
        else []
    )
    ticket_by_appointment = {t["appointment_id"]: t for t in tickets}

    patients = (
        {
            p["id"]: p
            for p in db.table("patients")
            .select("id, full_name, phone")
            .in_("id", list({a["patient_id"] for a in appointments}))
            .execute()
            .data
        }
        if appointments
        else {}
    )
    doctor_names = _name_map(db, "staff", {a.get("staff_id") for a in appointments}, "full_name")
    service_names = _name_map(db, "services", {a.get("service_id") for a in appointments})

    result.arrivals = [
        DeskArrival(
            appointment_id=a["id"],
            scheduled_at=a["scheduled_at"],
            duration_minutes=a["duration_minutes"],
            status=a["status"],
            patient_id=a["patient_id"],
            patient_name=patients.get(a["patient_id"], {}).get("full_name", "—"),
            patient_phone=patients.get(a["patient_id"], {}).get("phone"),
            doctor_name=doctor_names.get(a.get("staff_id")),
            service_name=service_names.get(a.get("service_id")),
            confirmation_code=a.get("confirmation_code"),
            checked_in=a["id"] in ticket_by_appointment,
            ticket_number=ticket_by_appointment.get(a["id"], {}).get("ticket_number"),
            queue_status=ticket_by_appointment.get(a["id"], {}).get("status"),
        )
        for a in appointments
    ]

    result.expected_count = sum(a["status"] not in _SETTLED_STATUSES for a in appointments)
    result.checked_in_count = len(ticket_by_appointment)
    statuses = [t["status"] for t in tickets]
    result.waiting_count = sum(s in ("waiting", "called") for s in statuses)
    result.in_progress_count = statuses.count("in_progress")
    result.done_count = statuses.count("done")

    if current.has_permission("conversation.view"):
        channels = db.table("channels").select("id").eq("branch_id", resolved).execute().data
        if channels:
            rows = (
                db.table("conversations")
                .select("id")
                .in_("channel_id", [c["id"] for c in channels])
                .eq("needs_attention", True)
                .execute()
                .data
            )
            result.needs_attention_count = len(rows)

    return result
