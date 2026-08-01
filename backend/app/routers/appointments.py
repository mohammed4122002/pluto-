import io
from uuid import UUID

import qrcode
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from supabase import Client

from app.core.auth import CurrentStaff, allowed_branch_ids, assert_branch_access, require_permission
from app.core.database import get_supabase
from app.core.service_auth import require_service_token
from app.models.schemas import (
    Appointment,
    AppointmentCreate,
    AppointmentStatusUpdate,
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
    WalkInRequest,
    WalkInResult,
)
from app.services.appointments import (
    apply_status_transition,
    generate_appointment_number,
    generate_confirmation_code,
)
from app.services.scheduling import (
    bulk_cancel_appointments,
    cancel_appointment,
    check_in_appointment,
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


@router.get("", response_model=list[Appointment])
def list_appointments(
    branch_id: str | None = None,
    status: str | None = None,
    patient_id: str | None = None,
    staff_id: str | None = None,
    current: CurrentStaff = Depends(require_permission("appointment.view")),
    db: Client = Depends(get_supabase),
):
    query = db.table("appointments").select("*").is_("deleted_at", "null").order("scheduled_at")
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
    if staff_id:
        query = query.eq("staff_id", staff_id)
    return query.execute().data


@router.post("", response_model=Appointment)
def create_appointment(
    payload: AppointmentCreate, current: CurrentStaff = Depends(require_permission("appointment.create")), db: Client = Depends(get_supabase)
):
    assert_branch_access(current, "appointment.create", str(payload.branch_id))
    data = payload.model_dump(mode="json")
    data["appointment_number"] = generate_appointment_number()
    data["confirmation_code"] = generate_confirmation_code()
    return db.table("appointments").insert(data).execute().data[0]


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
    hunting for them in the appointments list."""
    code = payload.confirmation_code.strip().upper()
    rows = db.table("appointments").select("id, branch_id").eq("confirmation_code", code).limit(1).execute().data
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
