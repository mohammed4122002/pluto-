import logging
import re
from datetime import datetime, timedelta, timezone

import httpx
from supabase import Client

logger = logging.getLogger(__name__)

# How wide a window GET /notifications/due looks in, so an external poller
# calling this every N minutes doesn't miss or double-fire a reminder.
_DUE_WINDOW_MINUTES = 10


def render_template(body_template: str, context: dict) -> str:
    def _sub(match: re.Match) -> str:
        return str(context.get(match.group(1), ""))

    return re.sub(r"\{\{(\w+)\}\}", _sub, body_template)


def _resolve_channel_for_patient(db: Client, patient_id: str) -> dict | None:
    conv = (
        db.table("conversations")
        .select("channel_id, channels(identifier, outbound_webhook_url, channel_type)")
        .eq("patient_id", patient_id)
        .order("created_at", desc=True)
        .limit(1)
        .execute()
        .data
    )
    if not conv or not conv[0].get("channels"):
        return None
    return conv[0]["channels"]


def send_notification_for_appointment(db: Client, appointment_id: str, schedule: dict, template: dict) -> None:
    """Best-effort delivery through the patient's most recent channel — never
    raises, so it can be called inline from status-transition code without
    risking the appointment update itself."""
    try:
        appt = (
            db.table("appointments")
            .select("*, patients(full_name, phone), staff!appointments_staff_id_fkey(full_name), branches(name)")
            .eq("id", appointment_id)
            .limit(1)
            .execute()
            .data
        )
        if not appt:
            return
        appt = appt[0]
        patient = appt.get("patients") or {}
        channel = _resolve_channel_for_patient(db, appt["patient_id"])

        log_row = {
            "appointment_id": appointment_id,
            "schedule_id": schedule["id"],
            "template_id": template["id"],
            # The channel it actually went out on, not the one the template is
            # labelled with. Templates carry a channel_type describing how
            # they're worded, but delivery always follows whichever channel the
            # patient last talked to us on — so logging the template's label
            # recorded telegram sends as whatsapp and made any per-channel
            # reporting wrong. Falls back to the template only when no channel
            # resolved, where there's no real delivery channel to name.
            "channel_type": (channel or {}).get("channel_type") or template["channel_type"],
            "recipient": patient.get("phone", ""),
        }

        if not channel or not channel.get("outbound_webhook_url"):
            log_row["status"] = "failed"
            log_row["error_message"] = "لا توجد قناة تواصل معروفة لهذا المريض"
            db.table("notification_log").insert(log_row).execute()
            return

        scheduled_at = datetime.fromisoformat(appt["scheduled_at"])
        message = render_template(
            template["body_template"],
            {
                "date": scheduled_at.strftime("%Y-%m-%d"),
                "time": scheduled_at.strftime("%H:%M"),
                "doctor_name": (appt.get("staff") or {}).get("full_name", ""),
                "branch_name": (appt.get("branches") or {}).get("name", ""),
                "appointment_number": appt.get("appointment_number", ""),
                "confirmation_code": appt.get("confirmation_code", ""),
                "patient_name": patient.get("full_name", ""),
            },
        )

        try:
            httpx.post(
                channel["outbound_webhook_url"],
                json={"recipient": patient.get("phone"), "message": message, "channel_identifier": channel["identifier"]},
                timeout=10,
            )
            log_row["status"] = "sent"
            log_row["sent_at"] = datetime.now(timezone.utc).isoformat()
        except httpx.HTTPError as exc:
            log_row["status"] = "failed"
            log_row["error_message"] = str(exc)

        db.table("notification_log").insert(log_row).execute()
    except Exception:
        logger.exception("send_notification_for_appointment failed for appointment_id=%s", appointment_id)


def fire_status_change_notifications(db: Client, appointment_id: str, new_status: str) -> None:
    schedules = (
        db.table("notification_schedules")
        .select("*, notification_templates(*)")
        .eq("trigger_type", "on_status_change")
        .eq("status_trigger", new_status)
        .eq("is_active", True)
        .execute()
        .data
    )
    for schedule in schedules:
        template = schedule.get("notification_templates")
        if template:
            send_notification_for_appointment(db, appointment_id, schedule, template)


def get_due_reminders(db: Client) -> list[dict]:
    """Computes (appointment, schedule) pairs due for a before/after-visit
    reminder right now, skipping any already logged. Meant to be polled by an
    external scheduler (e.g. an n8n Cron workflow) every _DUE_WINDOW_MINUTES."""
    now = datetime.now(timezone.utc)
    schedules = (
        db.table("notification_schedules")
        .select("*, notification_templates(*)")
        .in_("trigger_type", ["before_appointment", "after_appointment"])
        .eq("is_active", True)
        .execute()
        .data
    )
    due: list[dict] = []
    for schedule in schedules:
        offset = timedelta(minutes=schedule["offset_minutes"])
        window_start = now - offset - timedelta(minutes=_DUE_WINDOW_MINUTES / 2)
        window_end = now - offset + timedelta(minutes=_DUE_WINDOW_MINUTES / 2)

        candidates = (
            db.table("appointments")
            .select("id, scheduled_at, status")
            .gte("scheduled_at", window_start.isoformat())
            .lt("scheduled_at", window_end.isoformat())
            .in_("status", ["confirmed", "patient_confirmed", "completed"])
            .execute()
            .data
        )
        for appt in candidates:
            already_sent = (
                db.table("notification_log")
                .select("id")
                .eq("appointment_id", appt["id"])
                .eq("schedule_id", schedule["id"])
                .limit(1)
                .execute()
                .data
            )
            if already_sent:
                continue
            due.append({"appointment_id": appt["id"], "schedule": schedule})

    return due
