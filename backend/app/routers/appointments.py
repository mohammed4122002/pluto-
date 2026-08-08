import io
from datetime import datetime, timedelta, timezone
from uuid import UUID

import qrcode
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from supabase import Client

from app.core.auth import CurrentStaff, allowed_branch_ids, assert_branch_access, require_permission
from app.core.scoping import StaffScope, get_staff_scope
from app.core.database import get_supabase
from app.core.service_auth import require_service_token
from app.models.schemas import (
    Appointment,
    AppointmentCreate,
    AppointmentStatusUpdate,
    BulkBookingRequest,
    BulkBookingResult,
    BulkCancelRequest,
    BulkCancelResult,
    CancelRequest,
    CancelResult,
    CheckInByCodeRequest,
    CheckInRequest,
    CheckInResult,
    DoctorAbsenceRequest,
    DoctorAbsenceResult,
    MarkNoShowRequest,
    NoShowRateItem,
    RescheduleRequest,
    VisitType,
    WalkInRequest,
    WalkInResult,
)
from app.services.appointments import (
    apply_status_transition,
    generate_appointment_number,
    generate_confirmation_code,
    meeting_link_for,
)
from app.services.scheduling import (
    bulk_cancel_appointments,
    cancel_appointment,
    check_in_appointment,
    create_linked_appointments,
    handle_doctor_absence,
    mark_no_show,
    no_show_rate_report,
    register_walk_in,
    reschedule_appointment,
)

router = APIRouter(prefix="/appointments", tags=["appointments"])


def _appointment_branch_id(db: Client, appointment_id: str) -> str:
    rows = db.table("appointments").select("branch_id").eq("id", appointment_id).limit(1).execute().data
    if not rows:
        raise HTTPException(status_code=404, detail="الموعد غير موجود")
    return rows[0]["branch_id"]


# Appointments are inherently time-bounded work: nobody opens the dashboard to
# read every appointment the clinic has ever had. Without a window this
# endpoint returned the whole table on every page load, which is survivable at
# a few dozen rows and not at a few hundred thousand.
_DEFAULT_WINDOW_BACK_DAYS = 30
_DEFAULT_WINDOW_FORWARD_DAYS = 90


@router.get("", response_model=list[Appointment])
def list_appointments(
    branch_id: str | None = None,
    status: str | None = None,
    patient_id: str | None = None,
    staff_id: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    limit: int = Query(default=500, ge=1, le=2000),
    current: CurrentStaff = Depends(require_permission("appointment.view")),
    scope: StaffScope = Depends(get_staff_scope),
    db: Client = Depends(get_supabase),
):
    """Appointments in a time window, newest schedule first.

    The window defaults to the last 30 days and the next 90 unless one is given
    explicitly, or unless a single patient is asked for — one patient's whole
    history is bounded by that patient, so it is safe to return in full.
    """
    query = db.table("appointments").select("*").is_("deleted_at", "null").order("scheduled_at")

    if date_from:
        query = query.gte("scheduled_at", date_from)
    if date_to:
        query = query.lt("scheduled_at", date_to)
    if not date_from and not date_to and not patient_id:
        now = datetime.now(timezone.utc)
        query = query.gte("scheduled_at", (now - timedelta(days=_DEFAULT_WINDOW_BACK_DAYS)).isoformat())
        query = query.lt("scheduled_at", (now + timedelta(days=_DEFAULT_WINDOW_FORWARD_DAYS)).isoformat())
    if branch_id:
        assert_branch_access(current, "appointment.view", branch_id)
        query = query.eq("branch_id", branch_id)
    else:
        allowed = allowed_branch_ids(current, "appointment.view")
        if allowed is not None:
            if not allowed:
                return []
            query = query.in_("branch_id", allowed)
    if status:
        query = query.eq("status", status)
    if patient_id:
        query = query.eq("patient_id", patient_id)
    # A self-scoped role's grant is "their own schedule and patients only"
    # (per the doctor role's own description) -- enforced regardless of what
    # staff_id they pass, rather than letting them see another doctor's
    # appointments just by asking for it.
    if scope.is_self_scoped:
        query = query.eq("staff_id", scope.staff_id)
    elif staff_id:
        query = query.eq("staff_id", staff_id)
    return query.limit(limit).execute().data


@router.post("", response_model=Appointment)
def create_appointment(
    payload: AppointmentCreate, current: CurrentStaff = Depends(require_permission("appointment.create")), db: Client = Depends(get_supabase)
):
    assert_branch_access(current, "appointment.create", str(payload.branch_id))
    data = payload.model_dump(mode="json")
    data["appointment_number"] = generate_appointment_number()
    data["confirmation_code"] = generate_confirmation_code()
    created = db.table("appointments").insert(data).execute().data[0]
    link = meeting_link_for(db, created["id"], str(payload.visit_type_id) if payload.visit_type_id else None)
    if link:
        created = db.table("appointments").update({"meeting_link": link}).eq("id", created["id"]).execute().data[0]
    return created


@router.get("/visit-types", response_model=list[VisitType])
def list_visit_types(
    _current: CurrentStaff = Depends(require_permission("appointment.view")), db: Client = Depends(get_supabase)
):
    """FR-BKG-009: in-person / telemedicine / home visit -- picked once at
    booking time, drives whether a meeting_link gets generated."""
    return db.table("visit_types").select("*").eq("is_active", True).order("code").execute().data


@router.post("/bulk", response_model=BulkBookingResult)
def bulk_book(
    payload: BulkBookingRequest,
    current: CurrentStaff = Depends(require_permission("appointment.create")),
    db: Client = Depends(get_supabase),
):
    """FR-BKT-009/010/011/012/013/014: group sessions, family/sequential
    bookings, multi-service visits, and recurring or campaign appointments --
    see create_linked_appointments for how one `link_mode` covers all of
    them. Partial success is expected and reported per item, not all-or-nothing."""
    assert_branch_access(current, "appointment.create", str(payload.branch_id))
    if not payload.items:
        raise HTTPException(status_code=400, detail="لازم يكون فيه عنصر واحد على الأقل")
    recurrence_id, results = create_linked_appointments(
        db,
        str(payload.branch_id),
        payload.link_mode,
        payload.start_at,
        [item.model_dump() for item in payload.items],
        payload.occurrences,
        str(payload.visit_type_id) if payload.visit_type_id else None,
        payload.campaign_name,
    )
    return BulkBookingResult(recurrence_id=recurrence_id, results=results)


@router.patch("/{appointment_id}/status", response_model=Appointment)
def update_appointment_status(
    appointment_id: UUID,
    payload: AppointmentStatusUpdate,
    current: CurrentStaff = Depends(require_permission("appointment.update")),
    db: Client = Depends(get_supabase),
):
    existing = db.table("appointments").select("branch_id").eq("id", str(appointment_id)).limit(1).execute().data
    if not existing:
        raise HTTPException(status_code=404, detail="الموعد غير موجود")
    assert_branch_access(current, "appointment.update", existing[0]["branch_id"])

    return apply_status_transition(
        db,
        str(appointment_id),
        payload.status,
        payload.reason,
        str(payload.changed_by) if payload.changed_by else current.id,
    )


@router.post("/{appointment_id}/reschedule", response_model=Appointment)
def reschedule(
    appointment_id: UUID,
    payload: RescheduleRequest,
    current: CurrentStaff = Depends(require_permission("appointment.reschedule")),
    db: Client = Depends(get_supabase),
):
    assert_branch_access(current, "appointment.reschedule", _appointment_branch_id(db, str(appointment_id)))
    return reschedule_appointment(
        db, str(appointment_id), str(payload.new_slot_id), payload.session_id, payload.reason, current.id
    )


@router.post("/{appointment_id}/cancel", response_model=CancelResult)
def cancel(
    appointment_id: UUID,
    payload: CancelRequest,
    current: CurrentStaff = Depends(require_permission("appointment.cancel")),
    db: Client = Depends(get_supabase),
):
    assert_branch_access(current, "appointment.cancel", _appointment_branch_id(db, str(appointment_id)))
    result = cancel_appointment(db, str(appointment_id), payload.reason, payload.cancelled_by, current.id)
    return CancelResult(appointment=result["appointment"], fee_charged=result["fee_charged"])


@router.post("/bulk-cancel", response_model=BulkCancelResult)
def bulk_cancel(
    payload: BulkCancelRequest,
    current: CurrentStaff = Depends(require_permission("appointment.cancel")),
    db: Client = Depends(get_supabase),
):
    """Branch-closure (or plain doctor-absence-with-no-substitute) bulk
    cancellation — always cancels, never reassigns. For a doctor absence
    where a substitute might be able to absorb the bookings, use
    POST /appointments/handle-doctor-absence instead."""
    if payload.branch_id:
        assert_branch_access(current, "appointment.cancel", str(payload.branch_id))
    elif not payload.doctor_id:
        raise HTTPException(status_code=400, detail="حدد branch_id أو doctor_id على الأقل")
    count = bulk_cancel_appointments(
        db,
        str(payload.branch_id) if payload.branch_id else None,
        str(payload.doctor_id) if payload.doctor_id else None,
        payload.date_from.isoformat(),
        payload.date_to.isoformat(),
        payload.reason,
        current.id,
    )
    return BulkCancelResult(cancelled_count=count)


@router.post("/handle-doctor-absence", response_model=DoctorAbsenceResult)
def handle_absence(
    payload: DoctorAbsenceRequest,
    current: CurrentStaff = Depends(require_permission("appointment.cancel")),
    db: Client = Depends(get_supabase),
):
    """FR-ABS-002/003/004/005/009: for every appointment this doctor has in
    the given window, tries to move it to a registered substitute at the
    exact same time first; only cancels (fee-free, same as bulk-cancel)
    when no substitute exists or they have no open slot right then."""
    if payload.branch_id:
        assert_branch_access(current, "appointment.cancel", str(payload.branch_id))
    result = handle_doctor_absence(
        db,
        str(payload.doctor_id),
        str(payload.branch_id) if payload.branch_id else None,
        payload.date_from.isoformat(),
        payload.date_to.isoformat(),
        payload.reason,
        current.id,
    )
    return DoctorAbsenceResult(**result)


@router.post("/walk-in", response_model=WalkInResult)
def walk_in(
    payload: WalkInRequest,
    current: CurrentStaff = Depends(require_permission("queue.manage")),
    db: Client = Depends(get_supabase),
):
    """FR-WIN-001..007: registers a patient who showed up without a prior
    appointment — books the nearest open slot if one exists, otherwise
    registers the visit directly, and checks them straight into today's
    queue with the given priority."""
    assert_branch_access(current, "queue.manage", str(payload.branch_id))
    result = register_walk_in(
        db,
        str(payload.branch_id),
        str(payload.patient_id),
        str(payload.doctor_id) if payload.doctor_id else None,
        str(payload.service_id) if payload.service_id else None,
        payload.priority_level,
        payload.notes,
        current.id,
    )
    return WalkInResult(**result)


@router.post("/{appointment_id}/check-in", response_model=CheckInResult)
def check_in(
    appointment_id: UUID,
    payload: CheckInRequest,
    current: CurrentStaff = Depends(require_permission("appointment.check_in")),
    db: Client = Depends(get_supabase),
):
    assert_branch_access(current, "appointment.check_in", _appointment_branch_id(db, str(appointment_id)))
    result = check_in_appointment(db, str(appointment_id), payload.priority_level, current.id)
    return CheckInResult(appointment=result["appointment"], ticket=result["ticket"])


@router.post("/check-in-by-code", response_model=CheckInResult)
def check_in_by_code(
    payload: CheckInByCodeRequest,
    current: CurrentStaff = Depends(require_permission("appointment.check_in")),
    db: Client = Depends(get_supabase),
):
    """Lets front-desk staff check a patient in by scanning (or typing) the
    confirmation_code from their booking QR/confirmation message, instead of
    hunting for them in the appointments list. Also accepts the booking
    number (APT-...) since patients read either one out interchangeably and
    staff have no way to tell which one they're being given."""
    code = payload.confirmation_code.strip().upper()
    rows = db.table("appointments").select("id, branch_id").eq("confirmation_code", code).limit(1).execute().data
    if not rows:
        rows = db.table("appointments").select("id, branch_id").eq("appointment_number", code).limit(1).execute().data
    if not rows:
        raise HTTPException(status_code=404, detail="لم يتم العثور على موعد بهذا الرمز")
    assert_branch_access(current, "appointment.check_in", rows[0]["branch_id"])
    result = check_in_appointment(db, rows[0]["id"], payload.priority_level, current.id)
    return CheckInResult(appointment=result["appointment"], ticket=result["ticket"])


@router.get("/{appointment_id}/qr-code.png", dependencies=[Depends(require_service_token)])
def appointment_qr_code(appointment_id: UUID, db: Client = Depends(get_supabase)):
    """Renders a QR image encoding this appointment's confirmation_code —
    the same code already shared with the patient in their booking
    confirmation, just in scannable form for front-desk check-in. Gated by
    the shared service token (not public) since Telegram/WhatsApp's own
    servers can't send it: the calling n8n workflow must fetch this as
    binary and relay it to the patient as a photo, not pass this URL
    straight to the channel's send-photo API."""
    rows = db.table("appointments").select("confirmation_code").eq("id", str(appointment_id)).limit(1).execute().data
    if not rows or not rows[0].get("confirmation_code"):
        raise HTTPException(status_code=404, detail="الموعد غير موجود")
    buf = io.BytesIO()
    qrcode.make(rows[0]["confirmation_code"]).save(buf, format="PNG")
    return Response(content=buf.getvalue(), media_type="image/png")


@router.post("/{appointment_id}/no-show", response_model=CancelResult)
def mark_appointment_no_show(
    appointment_id: UUID,
    payload: MarkNoShowRequest,
    current: CurrentStaff = Depends(require_permission("appointment.update")),
    db: Client = Depends(get_supabase),
):
    assert_branch_access(current, "appointment.update", _appointment_branch_id(db, str(appointment_id)))
    override = payload.override_grace_period and current.has_permission("appointment.override")
    result = mark_no_show(db, str(appointment_id), payload.reason, current.id, override)
    return CancelResult(appointment=result["appointment"], fee_charged=result["fee_charged"])


@router.get("/no-show-rate", response_model=list[NoShowRateItem])
def no_show_rate(
    branch_id: str | None = None,
    group_by: str = "doctor",
    date_from: str | None = None,
    date_to: str | None = None,
    current: CurrentStaff = Depends(require_permission("appointment.view")),
    db: Client = Depends(get_supabase),
):
    if group_by not in ("doctor", "branch", "service"):
        raise HTTPException(status_code=400, detail="group_by يجب أن يكون doctor أو branch أو service")
    if branch_id:
        assert_branch_access(current, "appointment.view", branch_id)
        branch_ids = [branch_id]
    else:
        branch_ids = allowed_branch_ids(current, "appointment.view")
        if branch_ids is not None and not branch_ids:
            return []
    return no_show_rate_report(db, branch_ids, group_by, date_from, date_to)
