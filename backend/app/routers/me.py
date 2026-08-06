"""The signed-in staff member's own workspace.

Every endpoint here answers "…for me", scoped server-side from the access
token — never from a client-supplied staff_id. Two things drove this router
into existence rather than more flags on the admin endpoints:

1. **Permissions.** The doctor screens were the admin screens, so they opened
   with ``/branches`` + ``/staff`` + ``/patients`` to resolve names. A doctor
   holds none of ``branch.view`` / ``staff.view``, so the first lookup 403'd
   and ``Promise.all`` took the whole page down with it. These views resolve
   names server-side, where the data is already in hand and no extra grant is
   needed to read it.

2. **Scope.** "My queue" filtered in the browser still ships the whole clinic's
   queue to the browser. Here the filter *is* the query.

Read permissions are unchanged (``queue.view``, ``slot.view``,
``appointment.view``, ``patient.view``, ``service.view``) — the RBAC catalog
stays the source of truth for who may open a screen; this router only narrows
*which rows* come back.
"""

from datetime import date as date_type
from datetime import datetime, time, timedelta, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from supabase import Client

from app.core.auth import CurrentStaff, get_current_staff, require_permission
from app.core.database import get_supabase
from app.core.scoping import StaffScope, get_staff_scope
from app.models.schemas import (
    Branch,
    MyCalendarAppointment,
    MyCalendarDay,
    MyCalendarSlot,
    MyPatient,
    MyQueue,
    MyQueueDay,
    MyQueueTicket,
    MyService,
    MyToday,
    MyTodayConversation,
    QueueTicket,
)
from app.services.queue import call_ticket, complete_ticket, skip_ticket, start_ticket

router = APIRouter(prefix="/me", tags=["me"])

# Statuses that mean "this visit happened", used to separate a patient's
# history from what is still ahead of them.
_COMPLETED_STATUSES = {"completed", "checked_out"}


def _day_bounds(day: date_type) -> tuple[str, str]:
    """UTC bounds for a calendar day.

    Matches the convention the slots engine and the admin calendar already use.
    Clinic hours (roughly 08:00–20:00 Asia/Amman) sit comfortably inside a
    single UTC day, so the two never disagree in practice.
    """
    start = datetime.combine(day, time.min, tzinfo=timezone.utc)
    return start.isoformat(), (start + timedelta(days=1)).isoformat()


def _name_map(db: Client, table: str, ids: set[str], column: str = "name") -> dict[str, str]:
    """id -> display name for a set of ids, one query, empty-safe."""
    ids = {i for i in ids if i}
    if not ids:
        return {}
    rows = db.table(table).select(f"id, {column}").in_("id", list(ids)).execute().data
    return {r["id"]: r[column] for r in rows}


@router.get("/branches", response_model=list[Branch])
def my_branches(
    scope: StaffScope = Depends(get_staff_scope),
    _current: CurrentStaff = Depends(get_current_staff),
    db: Client = Depends(get_supabase),
):
    """The branches I work at.

    Deliberately requires no ``branch.view``: which branches you are assigned
    to is your own profile, not the clinic's branch directory. This is what
    lets a doctor's calendar know where it is without granting them the
    org-wide branch list.
    """
    branch_ids = scope.branch_ids()
    if not branch_ids:
        return []
    return (
        db.table("branches")
        .select("*")
        .in_("id", branch_ids)
        .eq("is_active", True)
        .order("name")
        .execute()
        .data
    )


@router.get("/queue", response_model=MyQueueDay)
def my_queue(
    day: date_type | None = Query(default=None, alias="date"),
    _current: CurrentStaff = Depends(require_permission("queue.view")),
    scope: StaffScope = Depends(get_staff_scope),
    db: Client = Depends(get_supabase),
):
    """Today's queue for me, patients already resolved."""
    day = day or datetime.now(timezone.utc).date()
    queues = (
        db.table("queues")
        .select("*")
        .eq("doctor_id", scope.staff_id)
        .eq("queue_date", day.isoformat())
        .eq("is_active", True)
        .execute()
        .data
    )
    result = MyQueueDay(date=day, queues=[])
    if not queues:
        return result

    tickets = (
        db.table("queue_tickets")
        .select("*")
        .in_("queue_id", [q["id"] for q in queues])
        .order("ticket_number")
        .execute()
        .data
    )
    patients = db.table("patients").select("id, full_name, phone")
    patient_rows = (
        patients.in_("id", list({t["patient_id"] for t in tickets})).execute().data if tickets else []
    )
    by_patient = {p["id"]: p for p in patient_rows}
    branch_names = _name_map(db, "branches", {q["branch_id"] for q in queues})

    by_queue: dict[str, list[MyQueueTicket]] = {}
    for t in tickets:
        patient = by_patient.get(t["patient_id"], {})
        by_queue.setdefault(t["queue_id"], []).append(
            MyQueueTicket(
                **{k: t[k] for k in MyQueueTicket.model_fields if k in t},
                patient_name=patient.get("full_name", "—"),
                patient_phone=patient.get("phone"),
            )
        )

    result.queues = [
        MyQueue(
            id=q["id"],
            branch_id=q["branch_id"],
            branch_name=branch_names.get(q["branch_id"], "—"),
            queue_date=q["queue_date"],
            tickets=by_queue.get(q["id"], []),
        )
        for q in queues
    ]
    statuses = [t["status"] for t in tickets]
    result.waiting_count = sum(s in ("waiting", "called") for s in statuses)
    result.in_progress_count = statuses.count("in_progress")
    result.done_count = statuses.count("done")
    return result


def _ticket_action(action, ticket_id: UUID, scope: StaffScope, db: Client, *, pass_actor: bool = True):
    if not scope.can_manage_own_ticket(str(ticket_id)):
        raise HTTPException(status_code=403, detail="هاي التذكرة مو من طابورك")
    return action(db, str(ticket_id), scope.staff_id) if pass_actor else action(db, str(ticket_id))


@router.post("/queue/tickets/{ticket_id}/call", response_model=QueueTicket)
def call_my_ticket(
    ticket_id: UUID,
    _current: CurrentStaff = Depends(require_permission("queue.view")),
    scope: StaffScope = Depends(get_staff_scope),
    db: Client = Depends(get_supabase),
):
    """Advancing a ticket in *my own* queue.

    ``queue.manage`` remains the permission for driving anyone's queue — that
    is reception's and the nurse's job, and ``/queue-tickets/...`` still
    enforces it. A doctor holds only ``queue.view``, yet calling in their own
    next patient is their own act on their own queue, so ownership stands in
    for the clinic-wide grant here and nowhere else.
    """
    return _ticket_action(call_ticket, ticket_id, scope, db)


@router.post("/queue/tickets/{ticket_id}/start", response_model=QueueTicket)
def start_my_ticket(
    ticket_id: UUID,
    _current: CurrentStaff = Depends(require_permission("queue.view")),
    scope: StaffScope = Depends(get_staff_scope),
    db: Client = Depends(get_supabase),
):
    return _ticket_action(start_ticket, ticket_id, scope, db)


@router.post("/queue/tickets/{ticket_id}/complete", response_model=QueueTicket)
def complete_my_ticket(
    ticket_id: UUID,
    _current: CurrentStaff = Depends(require_permission("queue.view")),
    scope: StaffScope = Depends(get_staff_scope),
    db: Client = Depends(get_supabase),
):
    return _ticket_action(complete_ticket, ticket_id, scope, db)


@router.post("/queue/tickets/{ticket_id}/skip", response_model=QueueTicket)
def skip_my_ticket(
    ticket_id: UUID,
    _current: CurrentStaff = Depends(require_permission("queue.view")),
    scope: StaffScope = Depends(get_staff_scope),
    db: Client = Depends(get_supabase),
):
    return _ticket_action(skip_ticket, ticket_id, scope, db, pass_actor=False)


@router.get("/calendar", response_model=MyCalendarDay)
def my_calendar(
    day: date_type | None = Query(default=None, alias="date"),
    current: CurrentStaff = Depends(require_permission("slot.view")),
    scope: StaffScope = Depends(get_staff_scope),
    db: Client = Depends(get_supabase),
):
    """My day: the slots I have and the appointments booked into them.

    Appointments are included only if the caller also holds
    ``appointment.view`` — the two are separate permissions and this endpoint
    does not merge them.
    """
    day = day or datetime.now(timezone.utc).date()
    start, end = _day_bounds(day)

    slots = (
        db.table("slots")
        .select("*")
        .eq("doctor_id", scope.staff_id)
        .gte("start_at", start)
        .lt("start_at", end)
        .order("start_at")
        .execute()
        .data
    )

    appointments = []
    if current.has_permission("appointment.view"):
        appointments = (
            db.table("appointments")
            .select("*")
            .eq("staff_id", scope.staff_id)
            .is_("deleted_at", "null")
            .gte("scheduled_at", start)
            .lt("scheduled_at", end)
            .order("scheduled_at")
            .execute()
            .data
        )

    branch_names = _name_map(db, "branches", {r["branch_id"] for r in [*slots, *appointments]})
    service_names = _name_map(db, "services", {r.get("service_id") for r in [*slots, *appointments]})
    patient_rows = (
        db.table("patients")
        .select("id, full_name, phone")
        .in_("id", list({a["patient_id"] for a in appointments}))
        .execute()
        .data
        if appointments
        else []
    )
    by_patient = {p["id"]: p for p in patient_rows}

    return MyCalendarDay(
        date=day,
        branch_ids=sorted({r["branch_id"] for r in [*slots, *appointments]}),
        slots=[
            MyCalendarSlot(
                **{k: s[k] for k in ("id", "branch_id", "start_at", "end_at", "duration_minutes", "status")},
                branch_name=branch_names.get(s["branch_id"], "—"),
                service_name=service_names.get(s.get("service_id")),
            )
            for s in slots
        ],
        appointments=[
            MyCalendarAppointment(
                **{
                    k: a[k]
                    for k in (
                        "id", "scheduled_at", "duration_minutes", "status", "patient_id",
                        "branch_id", "reason_for_visit", "queue_number", "check_in_time", "slot_id",
                    )
                },
                patient_name=by_patient.get(a["patient_id"], {}).get("full_name", "—"),
                patient_phone=by_patient.get(a["patient_id"], {}).get("phone"),
                branch_name=branch_names.get(a["branch_id"], "—"),
                service_name=service_names.get(a.get("service_id")),
            )
            for a in appointments
        ],
    )


@router.get("/services", response_model=list[MyService])
def my_services(
    current: CurrentStaff = Depends(require_permission("service.view")),
    scope: StaffScope = Depends(get_staff_scope),
    db: Client = Depends(get_supabase),
):
    """The services I'm assigned to provide.

    Empty is a meaningful answer here, not an error: it means nobody has linked
    this doctor to a service yet, and the UI says so in those words instead of
    showing an empty catalogue.
    """
    links = db.table("service_doctors").select("service_id").eq("staff_id", scope.staff_id).execute().data
    service_ids = {link["service_id"] for link in links}
    if not service_ids:
        return []

    services = (
        db.table("services")
        .select("*")
        .in_("id", list(service_ids))
        .is_("deleted_at", "null")
        .order("name")
        .execute()
        .data
    )
    specialty_names = _name_map(db, "specialties", {s.get("specialty_id") for s in services}, column="name_ar")

    upcoming: dict[str, int] = {}
    if current.has_permission("appointment.view"):
        rows = (
            db.table("appointments")
            .select("service_id")
            .eq("staff_id", scope.staff_id)
            .is_("deleted_at", "null")
            .gte("scheduled_at", datetime.now(timezone.utc).isoformat())
            .execute()
            .data
        )
        for r in rows:
            if r["service_id"]:
                upcoming[r["service_id"]] = upcoming.get(r["service_id"], 0) + 1

    return [
        MyService(
            **{k: s[k] for k in ("id", "name", "description", "duration_minutes", "price", "is_active")},
            specialty_name=specialty_names.get(s.get("specialty_id")),
            upcoming_appointments=upcoming.get(s["id"], 0),
        )
        for s in services
    ]


@router.get("/patients", response_model=list[MyPatient])
def my_patients(
    _current: CurrentStaff = Depends(require_permission("patient.view")),
    scope: StaffScope = Depends(get_staff_scope),
    db: Client = Depends(get_supabase),
):
    """My patients, with the history that makes them mine.

    Visit counts and dates are computed from *my* appointments only, so the
    numbers on this screen never describe another doctor's relationship with
    the same patient.
    """
    appointments = (
        db.table("appointments")
        .select("patient_id, scheduled_at, status")
        .eq("staff_id", scope.staff_id)
        .is_("deleted_at", "null")
        .order("scheduled_at")
        .execute()
        .data
    )
    patient_ids = {a["patient_id"] for a in appointments}
    if not patient_ids:
        return []

    patients = (
        db.table("patients")
        .select("*")
        .in_("id", list(patient_ids))
        .is_("is_merged_into", "null")
        .is_("deleted_at", "null")
        .order("full_name")
        .execute()
        .data
    )

    now = datetime.now(timezone.utc)
    visits: dict[str, int] = {}
    last_visit: dict[str, str] = {}
    next_appt: dict[str, str] = {}
    for a in appointments:
        pid, when = a["patient_id"], a["scheduled_at"]
        if a["status"] in _COMPLETED_STATUSES:
            visits[pid] = visits.get(pid, 0) + 1
            if when > last_visit.get(pid, ""):
                last_visit[pid] = when
        elif datetime.fromisoformat(when) > now and pid not in next_appt:
            # appointments come back ordered by scheduled_at, so the first
            # future one is the next one.
            next_appt[pid] = when

    tag_rows = db.table("patient_tags").select("patient_id, tag").in_("patient_id", list(patient_ids)).execute().data
    tags: dict[str, list[str]] = {}
    for row in tag_rows:
        tags.setdefault(row["patient_id"], []).append(row["tag"])

    return [
        MyPatient(
            **{k: p[k] for k in ("id", "full_name", "phone", "email", "date_of_birth", "gender", "notes")},
            tags=tags.get(p["id"], []),
            visits_count=visits.get(p["id"], 0),
            last_visit_at=last_visit.get(p["id"]),
            next_appointment_at=next_appt.get(p["id"]),
        )
        for p in patients
    ]


# Statuses that mean the visit is over, so "what's left today" doesn't count them.
_FINISHED_STATUSES = {"completed", "checked_out", "cancelled", "cancelled_by_patient",
                      "cancelled_by_clinic", "cancelled_by_doctor", "no_show", "rejected", "expired"}


@router.get("/today", response_model=MyToday)
def my_today(
    current: CurrentStaff = Depends(get_current_staff),
    scope: StaffScope = Depends(get_staff_scope),
    db: Client = Depends(get_supabase),
):
    """The landing screen: who's in front of me, what's left today, who's waiting on a reply.

    Each block is gated on its own permission and simply stays empty when the
    caller doesn't hold it — a staff member without queue.view still gets a
    working screen rather than a 403. That is the property the old dashboard
    lacked, and the reason its first paint could fail outright.
    """
    today = datetime.now(timezone.utc).date()
    result = MyToday(date=today)

    if current.has_permission("queue.view"):
        queues = (
            db.table("queues").select("id").eq("doctor_id", scope.staff_id)
            .eq("queue_date", today.isoformat()).eq("is_active", True).execute().data
        )
        if queues:
            tickets = (
                db.table("queue_tickets").select("*")
                .in_("queue_id", [q["id"] for q in queues]).order("ticket_number").execute().data
            )
            names = {
                p["id"]: p
                for p in db.table("patients").select("id, full_name, phone")
                .in_("id", list({t["patient_id"] for t in tickets})).execute().data
            } if tickets else {}

            def _ticket(row: dict) -> MyQueueTicket:
                patient = names.get(row["patient_id"], {})
                return MyQueueTicket(
                    **{k: row[k] for k in MyQueueTicket.model_fields if k in row},
                    patient_name=patient.get("full_name", "—"),
                    patient_phone=patient.get("phone"),
                )

            result.now_serving = next((_ticket(t) for t in tickets if t["status"] == "in_progress"), None)
            result.up_next = next((_ticket(t) for t in tickets if t["status"] in ("waiting", "called")), None)
            result.waiting_count = sum(t["status"] in ("waiting", "called") for t in tickets)

    if current.has_permission("appointment.view"):
        start, end = _day_bounds(today)
        rows = (
            db.table("appointments").select("*").eq("staff_id", scope.staff_id)
            .is_("deleted_at", "null").gte("scheduled_at", start).lt("scheduled_at", end)
            .order("scheduled_at").execute().data
        )
        branch_names = _name_map(db, "branches", {r["branch_id"] for r in rows})
        service_names = _name_map(db, "services", {r.get("service_id") for r in rows})
        patients = {
            p["id"]: p
            for p in db.table("patients").select("id, full_name, phone")
            .in_("id", list({r["patient_id"] for r in rows})).execute().data
        } if rows else {}
        result.appointments = [
            MyCalendarAppointment(
                **{k: a[k] for k in ("id", "scheduled_at", "duration_minutes", "status", "patient_id",
                                     "branch_id", "reason_for_visit", "queue_number", "check_in_time", "slot_id")},
                patient_name=patients.get(a["patient_id"], {}).get("full_name", "—"),
                patient_phone=patients.get(a["patient_id"], {}).get("phone"),
                branch_name=branch_names.get(a["branch_id"], "—"),
                service_name=service_names.get(a.get("service_id")),
            )
            for a in rows
        ]
        result.completed_appointments = sum(a["status"] in ("completed", "checked_out") for a in rows)
        result.remaining_appointments = sum(a["status"] not in _FINISHED_STATUSES for a in rows)

    if current.has_permission("conversation.view"):
        rows = (
            db.table("conversations")
            .select("id, needs_attention, last_message_at, last_message_preview, "
                    "channels(channel_type), patients(full_name)")
            .eq("assigned_staff_id", scope.staff_id)
            .order("last_message_at", desc=True, nullsfirst=False)
            .limit(8)
            .execute()
            .data
        )
        result.conversations = [
            MyTodayConversation(
                id=r["id"],
                patient_name=(r.get("patients") or {}).get("full_name", "—"),
                last_message_preview=r.get("last_message_preview"),
                last_message_at=r.get("last_message_at"),
                needs_attention=r.get("needs_attention", False),
                channel_type=(r.get("channels") or {}).get("channel_type", "—"),
            )
            for r in rows
        ]
        result.needs_attention_count = sum(c.needs_attention for c in result.conversations)

    return result
