import logging
from datetime import datetime, timedelta, timezone

import httpx
from supabase import Client

from app.services.notifications import _resolve_channel_for_patient

logger = logging.getLogger(__name__)

_ACTIVE_RECALL_STATUSES = ("pending", "invited")
_ESCALATE_AFTER_DAYS = 3


def create_recall(
    db: Client,
    patient_id: str,
    branch_id: str,
    doctor_id: str | None,
    service_id: str | None,
    due_date: str,
    reason_type: str,
    reason_notes: str | None,
    source_appointment_id: str | None,
    created_by: str | None,
) -> dict:
    """FR-RCL-001/003: schedules a future follow-up for this patient. FR-RCL-007:
    never opens a second active recall for the same patient+reason while one
    is already pending/invited — returns the existing one instead."""
    existing = (
        db.table("recalls")
        .select("*")
        .eq("patient_id", patient_id)
        .eq("reason_type", reason_type)
        .in_("status", list(_ACTIVE_RECALL_STATUSES))
        .limit(1)
        .execute()
        .data
    )
    if existing:
        return existing[0]

    return (
        db.table("recalls")
        .insert(
            {
                "patient_id": patient_id,
                "branch_id": branch_id,
                "doctor_id": doctor_id,
                "service_id": service_id,
                "source_appointment_id": source_appointment_id,
                "due_date": due_date,
                "reason_type": reason_type,
                "reason_notes": reason_notes,
                "created_by": created_by,
            }
        )
        .execute()
        .data[0]
    )


def auto_create_recall_on_completion(db: Client, appointment_id: str) -> dict | None:
    """FR-RCL-002: opens a recall automatically once a completed appointment's
    service has default_recall_after_days configured — no doctor action
    needed. Best-effort: never raises, since this runs inline from the
    status-transition path and a recall failing shouldn't block completing
    the visit itself."""
    try:
        rows = (
            db.table("appointments")
            .select("id, patient_id, branch_id, staff_id, service_id, scheduled_at, services(default_recall_after_days)")
            .eq("id", appointment_id)
            .limit(1)
            .execute()
            .data
        )
        if not rows:
            return None
        appt = rows[0]
        days = (appt.get("services") or {}).get("default_recall_after_days")
        if not days:
            return None
        due_date = (datetime.fromisoformat(appt["scheduled_at"]) + timedelta(days=days)).date().isoformat()
        return create_recall(
            db,
            appt["patient_id"],
            appt["branch_id"],
            appt.get("staff_id"),
            appt.get("service_id"),
            due_date,
            "periodic_checkup",
            "تم إنشاؤه تلقائياً بعد إتمام الزيارة السابقة.",
            appointment_id,
            None,
        )
    except Exception:
        logger.exception("auto_create_recall_on_completion failed for appointment_id=%s", appointment_id)
        return None


def _send_one_invitation(db: Client, recall: dict) -> bool:
    patient = recall.get("patients") or {}
    channel = _resolve_channel_for_patient(db, recall["patient_id"])
    now_iso = datetime.now(timezone.utc).isoformat()
    log_row = {
        "channel_type": (channel or {}).get("channel_type") or "whatsapp",
        "recipient": patient.get("phone", ""),
    }

    if not channel or not channel.get("outbound_webhook_url"):
        log_row["status"] = "failed"
        log_row["error_message"] = "لا توجد قناة تواصل معروفة لهذا المريض"
        db.table("notification_log").insert(log_row).execute()
        db.table("recalls").update({"status": "invited", "invited_at": now_iso}).eq("id", recall["id"]).execute()
        return False

    message = (
        f"مرحباً {patient.get('full_name', '')}، حان وقت متابعتك الدورية بعيادتنا. يرجى التواصل معنا لحجز موعد."
    )
    try:
        httpx.post(
            channel["outbound_webhook_url"],
            json={"recipient": patient.get("phone"), "message": message, "channel_identifier": channel["identifier"]},
            timeout=10,
        )
        log_row["status"] = "sent"
        log_row["sent_at"] = now_iso
    except httpx.HTTPError as exc:
        log_row["status"] = "failed"
        log_row["error_message"] = str(exc)

    db.table("notification_log").insert(log_row).execute()
    db.table("recalls").update({"status": "invited", "invited_at": now_iso}).eq("id", recall["id"]).execute()
    return log_row["status"] == "sent"


def send_due_recall_invitations(db: Client) -> int:
    """FR-RCL-004: invites every patient whose recall is due today or
    earlier and hasn't been invited yet. Meant to be polled by an external
    scheduler, same as GET /notifications/process-due."""
    today = datetime.now(timezone.utc).date().isoformat()
    due = (
        db.table("recalls")
        .select("*, patients(full_name, phone)")
        .eq("status", "pending")
        .lte("due_date", today)
        .execute()
        .data
    )
    return sum(1 for recall in due if _send_one_invitation(db, recall))


def escalate_unresponsive_recalls(db: Client, days_threshold: int = _ESCALATE_AFTER_DAYS) -> int:
    """FR-RCL-006: recalls invited more than days_threshold days ago with no
    patient response get escalated so the call center can follow up by phone."""
    cutoff = (datetime.now(timezone.utc) - timedelta(days=days_threshold)).isoformat()
    overdue = db.table("recalls").select("id").eq("status", "invited").lt("invited_at", cutoff).execute().data
    now_iso = datetime.now(timezone.utc).isoformat()
    for row in overdue:
        db.table("recalls").update({"status": "escalated", "escalated_at": now_iso}).eq("id", row["id"]).execute()
    return len(overdue)


def resolve_recalls_on_booking(db: Client, patient_id: str, appointment_id: str) -> int:
    """FR-RCL-005/007: when this patient books a new appointment, any of
    their pending/invited recalls are marked booked and linked to it — this
    is what stops them from getting another invitation for something they
    already acted on."""
    open_recalls = (
        db.table("recalls")
        .select("id")
        .eq("patient_id", patient_id)
        .in_("status", list(_ACTIVE_RECALL_STATUSES))
        .execute()
        .data
    )
    now_iso = datetime.now(timezone.utc).isoformat()
    for row in open_recalls:
        db.table("recalls").update(
            {"status": "booked", "responded_at": now_iso, "resulting_appointment_id": appointment_id}
        ).eq("id", row["id"]).execute()
    return len(open_recalls)
