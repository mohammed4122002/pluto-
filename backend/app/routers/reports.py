from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends
from supabase import Client

from app.core.auth import CurrentStaff, allowed_branch_ids, assert_branch_access, require_permission
from app.core.database import get_supabase
from app.core.service_auth import require_service_token
from app.services.reports import (
    branch_comparison_report,
    build_dashboard_report,
    call_center_performance_report,
    nearest_slot_by_specialty,
    send_weekly_report,
)

router = APIRouter(prefix="/reports", tags=["reports"])

_DEFAULT_WINDOW_DAYS = 30


def _resolve_window(date_from: str | None, date_to: str | None) -> tuple[str, str]:
    if date_from and date_to:
        return date_from, date_to
    today = datetime.now(timezone.utc)
    return (date_from or (today - timedelta(days=_DEFAULT_WINDOW_DAYS)).isoformat()), (date_to or today.isoformat())


def _resolve_branch_ids(current: CurrentStaff, branch_id: str | None) -> list[str] | None:
    if branch_id:
        assert_branch_access(current, "appointment.view", branch_id)
        return [branch_id]
    return allowed_branch_ids(current, "appointment.view")


@router.get("/dashboard")
def dashboard(
    branch_id: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    # Clinic-wide AI metrics, not a personal view -- it used to ride on
    # appointment.view, which every clinical role holds, so reading your own
    # schedule also handed you the clinic's bot analytics.
    current: CurrentStaff = Depends(require_permission("bot_performance.view")),
    db: Client = Depends(get_supabase),
):
    branch_ids = _resolve_branch_ids(current, branch_id)
    if branch_ids is not None and not branch_ids:
        return build_dashboard_report(db, [], *_resolve_window(date_from, date_to))
    resolved_from, resolved_to = _resolve_window(date_from, date_to)
    return build_dashboard_report(db, branch_ids, resolved_from, resolved_to)


@router.get("/nearest-slots-by-specialty")
def nearest_slots_by_specialty(
    branch_id: str | None = None,
    current: CurrentStaff = Depends(require_permission("appointment.view")),
    db: Client = Depends(get_supabase),
):
    branch_ids = _resolve_branch_ids(current, branch_id)
    if branch_ids is not None and not branch_ids:
        return []
    return nearest_slot_by_specialty(db, branch_ids)


@router.get("/branch-comparison")
def branch_comparison(
    date_from: str | None = None,
    date_to: str | None = None,
    current: CurrentStaff = Depends(require_permission("appointment.view")),
    db: Client = Depends(get_supabase),
):
    branch_ids = allowed_branch_ids(current, "appointment.view")
    if branch_ids is not None and not branch_ids:
        return []
    if branch_ids is None:
        branch_ids = [b["id"] for b in db.table("branches").select("id").execute().data]
    resolved_from, resolved_to = _resolve_window(date_from, date_to)
    return branch_comparison_report(db, branch_ids, resolved_from, resolved_to)


@router.post("/send-weekly", dependencies=[Depends(require_service_token)])
def send_weekly(db: Client = Depends(get_supabase)):
    """Called by an external scheduler (n8n Cron), not the dashboard — gated
    by the shared service token instead of a staff JWT, same pattern as
    POST /notifications/process-due."""
    return send_weekly_report(db)


@router.get("/call-center-performance")
def call_center_performance(
    date_from: str | None = None,
    date_to: str | None = None,
    current: CurrentStaff = Depends(require_permission("appointment.view")),
    db: Client = Depends(get_supabase),
):
    resolved_from, resolved_to = _resolve_window(date_from, date_to)
    return call_center_performance_report(db, resolved_from, resolved_to)
