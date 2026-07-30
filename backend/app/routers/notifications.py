from fastapi import APIRouter, Depends
from supabase import Client

from app.core.auth import CurrentStaff, require_permission
from app.core.database import get_supabase
from app.core.service_auth import require_service_token
from app.services.notifications import get_due_reminders, send_notification_for_appointment

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("/templates")
def list_templates(
    _current: CurrentStaff = Depends(require_permission("notification.view")), db: Client = Depends(get_supabase)
):
    return db.table("notification_templates").select("*").execute().data


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
