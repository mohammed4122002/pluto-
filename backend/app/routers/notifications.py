from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from supabase import Client

from app.core.auth import CurrentStaff, require_permission
from app.core.database import get_supabase
from app.core.service_auth import require_service_token
from app.models.schemas import (
    NotificationSchedule,
    NotificationScheduleUpdate,
    NotificationTemplate,
    NotificationTemplateUpdate,
)
from app.services.notifications import get_due_reminders, send_notification_for_appointment

router = APIRouter(prefix="/notifications", tags=["notifications"])


def _schedule_from_row(row: dict) -> NotificationSchedule:
    return NotificationSchedule(
        id=row["id"],
        template_id=row["template_id"],
        trigger_type=row["trigger_type"],
        offset_minutes=row["offset_minutes"],
        status_trigger=row["status_trigger"],
        is_active=row["is_active"],
        template=row["notification_templates"],
    )


@router.get("/templates")
def list_templates(
    _current: CurrentStaff = Depends(require_permission("notification.view")), db: Client = Depends(get_supabase)
):
    return db.table("notification_templates").select("*").execute().data


@router.get("/schedules", response_model=list[NotificationSchedule])
def list_schedules(
    _current: CurrentStaff = Depends(require_permission("notification.view")), db: Client = Depends(get_supabase)
):
    """Every automated patient message the clinic can configure -- reminders,
    the post-visit rating request, booking confirmation, and the queue "call"
    message -- each with the template text and (for time-based ones) the
    offset that decides when it fires. The settings screen renders one editor
    per row; recall_invitation is deliberately absent here, it isn't reached
    through this schedule mechanism (see services/recalls.py)."""
    rows = db.table("notification_schedules").select("*, notification_templates(*)").execute().data
    return [_schedule_from_row(r) for r in rows]


@router.patch("/templates/{template_id}", response_model=NotificationTemplate)
def update_template(
    template_id: UUID,
    payload: NotificationTemplateUpdate,
    _current: CurrentStaff = Depends(require_permission("clinic_settings.update")),
    db: Client = Depends(get_supabase),
):
    updates = payload.model_dump(exclude_unset=True)
    if updates:
        db.table("notification_templates").update(updates).eq("id", str(template_id)).execute()
    row = db.table("notification_templates").select("*").eq("id", str(template_id)).limit(1).execute().data
    if not row:
        raise HTTPException(status_code=404, detail="القالب غير موجود")
    return row[0]


@router.patch("/schedules/{schedule_id}", response_model=NotificationSchedule)
def update_schedule(
    schedule_id: UUID,
    payload: NotificationScheduleUpdate,
    _current: CurrentStaff = Depends(require_permission("clinic_settings.update")),
    db: Client = Depends(get_supabase),
):
    updates = payload.model_dump(exclude_unset=True)
    if updates:
        db.table("notification_schedules").update(updates).eq("id", str(schedule_id)).execute()
    row = (
        db.table("notification_schedules")
        .select("*, notification_templates(*)")
        .eq("id", str(schedule_id))
        .limit(1)
        .execute()
        .data
    )
    if not row:
        raise HTTPException(status_code=404, detail="الجدولة غير موجودة")
    return _schedule_from_row(row[0])


@router.get("/log")
def list_log(
    appointment_id: str | None = None,
    _current: CurrentStaff = Depends(require_permission("notification.view")),
    db: Client = Depends(get_supabase),
):
    query = db.table("notification_log").select("*").order("created_at", desc=True)
    if appointment_id:
        query = query.eq("appointment_id", appointment_id)
    return query.limit(200).execute().data


@router.post("/process-due", dependencies=[Depends(require_service_token)])
def process_due_reminders(db: Client = Depends(get_supabase)):
    """Called by an external scheduler (n8n Cron), not the dashboard — gated
    by the shared service token instead of a staff JWT.
    Computes and immediately sends whatever reminders are due."""
    due = get_due_reminders(db)
    for item in due:
        schedule = item["schedule"]
        template = schedule.get("notification_templates")
        if template:
            send_notification_for_appointment(db, item["appointment_id"], schedule, template)
    return {"processed": len(due)}
