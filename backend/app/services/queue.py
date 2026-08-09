from datetime import datetime, timezone

from fastapi import HTTPException
from supabase import Client

from app.services.appointments import apply_status_transition


def _get_ticket(db: Client, ticket_id: str) -> dict:
    rows = db.table("queue_tickets").select("*").eq("id", ticket_id).limit(1).execute().data
    if not rows:
        raise HTTPException(status_code=404, detail="التذكرة غير موجودة")
    return rows[0]


def call_ticket(db: Client, ticket_id: str, changed_by: str | None) -> dict:
    ticket = _get_ticket(db, ticket_id)
    if ticket["status"] not in ("waiting", "skipped"):
        raise HTTPException(status_code=409, detail=f"لا يمكن استدعاء تذكرة بحالة '{ticket['status']}'")
    updated = (
        db.table("queue_tickets")
        .update({"status": "called", "called_at": datetime.now(timezone.utc).isoformat()})
        .eq("id", ticket_id)
        .execute()
        .data[0]
    )
    apply_status_transition(db, ticket["appointment_id"], "called", None, changed_by)
    return updated


def skip_ticket(db: Client, ticket_id: str) -> dict:
    ticket = _get_ticket(db, ticket_id)
    if ticket["status"] not in ("waiting", "called"):
        raise HTTPException(status_code=409, detail=f"لا يمكن تخطي تذكرة بحالة '{ticket['status']}'")
    return db.table("queue_tickets").update({"status": "skipped"}).eq("id", ticket_id).execute().data[0]


def start_ticket(db: Client, ticket_id: str, changed_by: str | None) -> dict:
    ticket = _get_ticket(db, ticket_id)
    if ticket["status"] not in ("called", "waiting"):
        raise HTTPException(status_code=409, detail=f"لا يمكن بدء تذكرة بحالة '{ticket['status']}'")
    updated = (
        db.table("queue_tickets")
        .update({"status": "in_progress", "started_at": datetime.now(timezone.utc).isoformat()})
        .eq("id", ticket_id)
        .execute()
        .data[0]
    )
    apply_status_transition(db, ticket["appointment_id"], "in_consultation", None, changed_by)
    return updated


def complete_ticket(db: Client, ticket_id: str, changed_by: str | None) -> dict:
    ticket = _get_ticket(db, ticket_id)
    if ticket["status"] != "in_progress":
        raise HTTPException(status_code=409, detail=f"لا يمكن إنهاء تذكرة بحالة '{ticket['status']}'")
    updated = (
        db.table("queue_tickets")
        .update({"status": "done", "ended_at": datetime.now(timezone.utc).isoformat()})
        .eq("id", ticket_id)
        .execute()
        .data[0]
    )
    apply_status_transition(db, ticket["appointment_id"], "completed", None, changed_by)
    return updated


def update_ticket(db: Client, ticket_id: str, priority_level: str | None, transfer_to_queue_id: str | None) -> dict:
    _get_ticket(db, ticket_id)
    updates: dict = {}
    if priority_level:
        updates["priority_level"] = priority_level
    if transfer_to_queue_id:
        updates["queue_id"] = transfer_to_queue_id
        updates["status"] = "waiting"
        updates["called_at"] = None
    if not updates:
        return _get_ticket(db, ticket_id)
    return db.table("queue_tickets").update(updates).eq("id", ticket_id).execute().data[0]


# A ticket that nobody closed keeps the patient in line on every queue screen.
_OPEN_TICKET_STATUSES = ("waiting", "called", "in_progress")


def close_open_ticket_for_appointment(db: Client, appointment_id: str) -> dict | None:
    """Marks any still-open queue ticket for this appointment as skipped.

    Cancelling or no-showing an appointment released its slot but left the
    queue ticket untouched, so a patient who had already checked in stayed in
    the line: reception kept seeing them, and the doctor would call a name
    belonging to someone who had gone home. This is the mirror of the opposite
    bug, where a status set by hand advanced the appointment without ever
    creating a ticket.

    'skipped' rather than 'done' on purpose -- the patient was never seen, and
    'done' would count the visit as a completed consultation in the reports.

    The caller has already moved the appointment to its cancelled/no_show
    status, so this deliberately does not touch appointment status itself.
    """
    rows = (
        db.table("queue_tickets")
        .select("id,status")
        .eq("appointment_id", appointment_id)
        .in_("status", list(_OPEN_TICKET_STATUSES))
        .limit(1)
        .execute()
        .data
    )
    if not rows:
        return None
    return db.table("queue_tickets").update({"status": "skipped"}).eq("id", rows[0]["id"]).execute().data[0]


def close_stale_queue_tickets(db: Client) -> int:
    """Closes tickets left open on a queue whose day has already passed.

    A queue is a single day's line. Nothing ever closed one out, so a patient
    who checked in and was never called stayed 'waiting' indefinitely -- the
    live database had tickets open since a week earlier. They no longer show on
    the queue screen, which reads today's queue, but they quietly skew every
    wait-time and throughput figure drawn from queue_tickets.

    Only the ticket is closed. Whether the visit actually happened is a
    clinical judgement this cannot make, so the appointment keeps its status
    and surfaces to staff through the overdue badge on the appointments table.
    """
    today = datetime.now(timezone.utc).date().isoformat()
    stale_queues = db.table("queues").select("id").lt("queue_date", today).execute().data
    if not stale_queues:
        return 0

    rows = (
        db.table("queue_tickets")
        .select("id")
        .in_("queue_id", [q["id"] for q in stale_queues])
        .in_("status", list(_OPEN_TICKET_STATUSES))
        .execute()
        .data
    )
    for row in rows:
        db.table("queue_tickets").update({"status": "skipped"}).eq("id", row["id"]).execute()
    return len(rows)
