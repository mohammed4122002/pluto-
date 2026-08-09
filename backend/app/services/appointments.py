import secrets
from datetime import datetime, timezone

from fastapi import HTTPException
from supabase import Client

from app.services.notifications import fire_status_change_notifications
from app.services.packages import deduct_package_session_for_appointment
from app.services.payments import create_payment_for_appointment
from app.services.recalls import auto_create_recall_on_completion

# Timestamp columns that get auto-stamped when an appointment enters a status.
_STATUS_TIMESTAMP_COLUMNS = {
    "checked_in": "check_in_time",
    "in_consultation": "consultation_start_time",
    "completed": "completion_time",
}


def generate_appointment_number() -> str:
    today = datetime.now(timezone.utc).strftime("%Y%m%d")
    return f"APT-{today}-{secrets.token_hex(3).upper()}"


def generate_confirmation_code() -> str:
    return secrets.token_hex(3).upper()


def meeting_link_for(db: Client, appointment_id: str, visit_type_id: str | None) -> str | None:
    """FR-BKT-006 (telemedicine booking): a keyless Jitsi room, one per
    appointment, generated the moment the visit is known to be video --
    no video-platform account or integration needed for a link that only
    has to get two people into the same room."""
    if not visit_type_id:
        return None
    rows = db.table("visit_types").select("code").eq("id", visit_type_id).limit(1).execute().data
    if not rows or rows[0]["code"] != "telemedicine":
        return None
    return f"https://meet.jit.si/pluto-{appointment_id}"


# Statuses that only check-in and the queue may set. Each one is written
# alongside a queue_tickets row -- check_in_appointment creates the ticket and
# moves the appointment to checked_in then waiting, and queue call/start drive
# called and in_consultation. Setting one through the plain status endpoint
# advances the appointment without ever creating the ticket, so the patient
# reads as waiting on the appointments table while being invisible on every
# queue screen. Internal callers use apply_status_transition directly and are
# deliberately not subject to this; it guards the untrusted API boundary.
#
# 'completed' is absent on purpose: closing out an appointment that never
# entered the queue is legitimate manual work.
QUEUE_OWNED_STATUSES = frozenset({"checked_in", "waiting", "called", "in_consultation"})


def apply_status_transition(
    db: Client, appointment_id: str, new_status: str, reason: str | None, changed_by: str | None
) -> dict:
    """Validates the transition against status_transitions (FR-STS-001), records
    appointment_status_history, and stamps the relevant timestamp/flag columns."""
    current = db.table("appointments").select("*").eq("id", appointment_id).limit(1).execute().data
    if not current:
        raise HTTPException(status_code=404, detail="الموعد غير موجود")
    old_status = current[0]["status"]
    if old_status == new_status:
        return current[0]

    allowed = (
        db.table("status_transitions")
        .select("id")
        .eq("from_status", old_status)
        .eq("to_status", new_status)
        .limit(1)
        .execute()
        .data
    )
    if not allowed:
        raise HTTPException(status_code=409, detail=f"لا يمكن الانتقال من الحالة '{old_status}' إلى '{new_status}'.")

    updates: dict = {"status": new_status}
    timestamp_col = _STATUS_TIMESTAMP_COLUMNS.get(new_status)
    if timestamp_col:
        updates[timestamp_col] = datetime.now(timezone.utc).isoformat()
    if new_status == "no_show":
        updates["no_show_flag"] = True
    if new_status in ("cancelled_by_patient", "cancelled_by_clinic", "cancelled_by_doctor", "cancelled"):
        if reason:
            updates["cancellation_reason"] = reason
    if new_status == "rescheduled" and reason:
        updates["rescheduling_reason"] = reason
    if changed_by:
        updates["last_modified_by"] = changed_by

    updated = db.table("appointments").update(updates).eq("id", appointment_id).execute().data[0]

    db.table("appointment_status_history").insert(
        {
            "appointment_id": appointment_id,
            "old_status": old_status,
            "new_status": new_status,
            "changed_by": changed_by,
            "reason": reason,
        }
    ).execute()

    fire_status_change_notifications(db, appointment_id, new_status)
    if new_status == "confirmed":
        create_payment_for_appointment(db, appointment_id)
    if new_status == "completed":
        auto_create_recall_on_completion(db, appointment_id)
        deduct_package_session_for_appointment(db, appointment_id)

    return updated
