from datetime import date, datetime, timedelta, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from postgrest.exceptions import APIError
from supabase import Client

from app.core.auth import CurrentStaff, allowed_branch_ids, assert_branch_access, require_permission
from app.core.database import get_supabase
from app.models.schemas import (
    Slot,
    SlotBookRequest,
    SlotBookResult,
    SlotGenerateRequest,
    SlotGenerateResult,
    SlotHoldRequest,
    SlotReleaseRequest,
    SlotSearchResult,
)
from app.services.appointments import generate_appointment_number, generate_confirmation_code
from app.services.recalls import resolve_recalls_on_booking
from app.services.slots import generate_slots_for_doctor

router = APIRouter(prefix="/slots", tags=["slots"])


def _slot_branch_id(db: Client, slot_id: str) -> str:
    rows = db.table("slots").select("branch_id").eq("id", slot_id).limit(1).execute().data
    if not rows:
        raise HTTPException(status_code=404, detail="الموعد غير موجود")
    return rows[0]["branch_id"]


@router.post("/generate", response_model=SlotGenerateResult)
def generate_slots(
    payload: SlotGenerateRequest, current: CurrentStaff = Depends(require_permission("slot.manage")), db: Client = Depends(get_supabase)
):
    assert_branch_access(current, "slot.manage", str(payload.branch_id))
    created, reason = generate_slots_for_doctor(
        db, str(payload.staff_id), str(payload.branch_id), payload.from_date, payload.to_date
    )
    return SlotGenerateResult(created=created, reason=reason)


@router.get("", response_model=list[Slot])
def search_slots(
    branch_id: str | None = None,
    staff_id: str | None = None,
    service_id: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    status: str = "available",
    current: CurrentStaff = Depends(require_permission("slot.view")),
    db: Client = Depends(get_supabase),
):
    query = db.table("slots").select("*").order("start_at")
    if status != "all":
        statuses = [s.strip() for s in status.split(",") if s.strip()]
        query = query.in_("status", statuses) if len(statuses) > 1 else query.eq("status", statuses[0])
    if branch_id:
        assert_branch_access(current, "slot.view", branch_id)
        query = query.eq("branch_id", branch_id)
    else:
        allowed = allowed_branch_ids(current, "slot.view")
        if allowed is not None:
            if not allowed:
                return []
            query = query.in_("branch_id", allowed)
    if staff_id:
        query = query.eq("doctor_id", staff_id)
    if service_id:
        query = query.eq("service_id", service_id)
    if date_from:
        query = query.gte("start_at", date_from)
    if date_to:
        query = query.lt("start_at", date_to)
    return query.execute().data


@router.get("/search", response_model=SlotSearchResult)
def search_available_slots(
    branch_id: str | None = None,
    specialty_id: str | None = None,
    staff_id: str | None = None,
    service_id: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    doctor_gender: str | None = None,
    doctor_language: str | None = None,
    min_price: float | None = None,
    max_price: float | None = None,
    patient_id: str | None = None,
    nearest: bool = False,
    current: CurrentStaff = Depends(require_permission("slot.view")),
    db: Client = Depends(get_supabase),
):
    """FR-SEA-001..010: rich patient-facing search — filters beyond the plain
    listing above (specialty/doctor gender & language/price), hides slots the
    patient isn't eligible for, and suggests alternative branches/doctors when
    the exact filters come up empty."""
    allowed = allowed_branch_ids(current, "slot.view")
    if branch_id:
        assert_branch_access(current, "slot.view", branch_id)

    patient = None
    if patient_id:
        rows = db.table("patients").select("*").eq("id", patient_id).limit(1).execute().data
        patient = rows[0] if rows else None

    is_existing_patient = False
    if patient:
        prior = (
            db.table("appointments")
            .select("id")
            .eq("patient_id", patient_id)
            .in_("status", ["completed", "checked_in", "checked_out", "confirmed", "patient_confirmed"])
            .limit(1)
            .execute()
            .data
        )
        is_existing_patient = bool(prior)

    def eligible(slot: dict) -> bool:
        service = slot.get("services") or {}
        if specialty_id and service.get("specialty_id") != specialty_id:
            return False
        if min_price is not None and (service.get("price") or 0) < min_price:
            return False
        if max_price is not None and (service.get("price") or 0) > max_price:
            return False
        doctor = slot.get("staff") or {}
        if doctor_gender and doctor.get("gender") != doctor_gender:
            return False
        if doctor_language and doctor_language not in (doctor.get("languages") or []):
            return False
        if patient:
            if slot.get("new_patient_only") and is_existing_patient:
                return False
            if slot.get("existing_patient_only") and not is_existing_patient:
                return False
            min_age = service.get("min_age")
            if min_age and patient.get("date_of_birth"):
                dob = date.fromisoformat(patient["date_of_birth"])
                age = (date.today() - dob).days // 365
                if age < min_age:
                    return False
            restriction = service.get("patient_gender_restriction")
            if restriction and patient.get("gender") and restriction != patient["gender"]:
                return False
        return True

    def run_query(*, use_branch_id: str | None, use_staff_id: str | None) -> list[dict]:
        q = (
            db.table("slots")
            .select("*, services(price, specialty_id, min_age, patient_gender_restriction), staff!slots_doctor_id_fkey(gender, languages)")
            .eq("status", "available")
            .order("start_at")
        )
        if use_branch_id:
            q = q.eq("branch_id", use_branch_id)
        elif allowed is not None:
            if not allowed:
                return []
            q = q.in_("branch_id", allowed)
        if use_staff_id:
            q = q.eq("doctor_id", use_staff_id)
        if service_id:
            q = q.eq("service_id", service_id)
        if date_from:
            q = q.gte("start_at", date_from)
        if date_to:
            q = q.lt("start_at", date_to)
        rows = q.execute().data
        return [r for r in rows if eligible(r)]

    matches = run_query(use_branch_id=branch_id, use_staff_id=staff_id)

    alternative_branches: list[dict] = []
    if not matches and branch_id:
        alternative_branches = run_query(use_branch_id=None, use_staff_id=staff_id)

    alternative_doctors: list[dict] = []
    if not matches and staff_id:
        alternative_doctors = run_query(use_branch_id=branch_id, use_staff_id=None)

    if nearest:
        matches = matches[:1]

    return SlotSearchResult(
        matches=matches,
        nearest=matches[0] if matches else None,
        alternative_branches=alternative_branches[:10],
        alternative_doctors=alternative_doctors[:10],
    )


@router.post("/{slot_id}/hold", response_model=Slot)
def hold_slot(
    slot_id: UUID,
    payload: SlotHoldRequest,
    current: CurrentStaff = Depends(require_permission("appointment.create")),
    db: Client = Depends(get_supabase),
):
    assert_branch_access(current, "appointment.create", _slot_branch_id(db, str(slot_id)))
    held_until = (datetime.now(timezone.utc) + timedelta(minutes=payload.hold_minutes)).isoformat()
    result = (
        db.table("slots")
        .update({"status": "temporarily_held", "held_until": held_until, "held_by_session": payload.session_id})
        .eq("id", str(slot_id))
        .eq("status", "available")
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=409, detail="الموعد لم يعد متاحاً — تم حجزه للتو من مستخدم آخر.")
    return result.data[0]


@router.post("/{slot_id}/release")
def release_slot(
    slot_id: UUID,
    payload: SlotReleaseRequest,
    current: CurrentStaff = Depends(require_permission("appointment.create")),
    db: Client = Depends(get_supabase),
):
    assert_branch_access(current, "appointment.create", _slot_branch_id(db, str(slot_id)))
    result = (
        db.table("slots")
        .update({"status": "available", "held_until": None, "held_by_session": None})
        .eq("id", str(slot_id))
        .eq("status", "temporarily_held")
        .eq("held_by_session", payload.session_id)
        .execute()
    )
    return {"released": bool(result.data)}


@router.post("/{slot_id}/book", response_model=SlotBookResult)
def book_slot(
    slot_id: UUID,
    payload: SlotBookRequest,
    current: CurrentStaff = Depends(require_permission("appointment.create")),
    db: Client = Depends(get_supabase),
):
    assert_branch_access(current, "appointment.create", _slot_branch_id(db, str(slot_id)))
    try:
        result = db.rpc(
            "book_slot",
            {
                "p_slot_id": str(slot_id),
                "p_patient_id": str(payload.patient_id),
                "p_held_by_session": payload.session_id,
                "p_notes": payload.notes,
                "p_source": payload.source,
            },
        ).execute()
    except APIError as exc:
        raise HTTPException(status_code=409, detail=exc.message) from exc

    appointment_id = result.data
    updates = {"appointment_number": generate_appointment_number(), "confirmation_code": generate_confirmation_code()}
    if payload.service_id:
        # book_slot() never sets appointments.service_id -- slots themselves
        # carry no service_id (generate_slots_for_doctor has no notion of
        # "which service"), so without this every dashboard-booked
        # appointment had no service on it at all: no price for invoicing,
        # no deposit_amount to request. Confirmed live via a real invoice
        # coming back subtotal=0 for a completed visit booked this way.
        updates["service_id"] = str(payload.service_id)
    if payload.patient_package_id:
        updates["patient_package_id"] = str(payload.patient_package_id)
    db.table("appointments").update(updates).eq("id", appointment_id).execute()
    resolve_recalls_on_booking(db, str(payload.patient_id), appointment_id)

    return SlotBookResult(appointment_id=appointment_id)
