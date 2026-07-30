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
