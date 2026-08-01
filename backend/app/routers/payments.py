from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from supabase import Client

from app.core.auth import CurrentStaff, allowed_branch_ids, assert_branch_access, require_permission
from app.core.database import get_supabase
from app.core.rate_limit import rate_limit_receipt_submission
from app.core.service_auth import require_service_token
from app.models.schemas import (
    ApplyCouponRequest,
    Payment,
    PaymentMethod,
    PaymentMethodCreate,
    PaymentReceiptSubmit,
    PaymentRejectRequest,
    PaymentWithDetails,
    RefundRequest,
)
from app.services.payments import apply_coupon, reject_payment, refund_payment, submit_receipt as submit_receipt_service, verify_payment

router = APIRouter(tags=["payments"])


def _payment_branch_id(db: Client, payment_id: str) -> str:
    row = (
        db.table("payments")
        .select("appointments(branch_id), patient_packages(branch_id)")
        .eq("id", payment_id)
        .single()
        .execute()
        .data
    )
    appt = row.get("appointments")
    if appt:
        return appt["branch_id"]
    package = row.get("patient_packages")
    if package:
        return package["branch_id"]
    raise HTTPException(status_code=404, detail="تعذر تحديد الفرع لهذه الدفعة")


@router.get("/payment-methods", response_model=list[PaymentMethod])
def list_payment_methods(
    branch_id: str | None = None,
    current: CurrentStaff = Depends(require_permission("payment.view")),
    db: Client = Depends(get_supabase),
):
    if branch_id:
        assert_branch_access(current, "payment.view", branch_id)
    query = db.table("payment_methods").select("*")
    if branch_id:
        query = query.or_(f"branch_id.eq.{branch_id},branch_id.is.null")
    return query.execute().data


@router.post("/payment-methods", response_model=PaymentMethod)
def create_payment_method(
    payload: PaymentMethodCreate, current: CurrentStaff = Depends(require_permission("payment.manage")), db: Client = Depends(get_supabase)
):
    if payload.branch_id:
        assert_branch_access(current, "payment.manage", str(payload.branch_id))
    data = payload.model_dump(mode="json")
    return db.table("payment_methods").insert(data).execute().data[0]


@router.get("/payments", response_model=list[PaymentWithDetails])
def list_payments(
    status: str | None = None, current: CurrentStaff = Depends(require_permission("payment.view")), db: Client = Depends(get_supabase)
):
    query = (
        db.table("payments")
        .select(
            "*, patients(full_name, phone), "
            "appointments(appointment_number, scheduled_at, branch_id), "
            "patient_packages(branch_id)"
        )
        .order("created_at", desc=True)
    )
    if status:
        query = query.eq("status", status)
    rows = query.execute().data

    allowed = allowed_branch_ids(current, "payment.view")
    result = []
    for row in rows:
        patient = row.pop("patients", None) or {}
        appt = row.pop("appointments", None) or {}
        package = row.pop("patient_packages", None) or {}
        branch_id = appt.get("branch_id") or package.get("branch_id")
        if allowed is not None and branch_id not in allowed:
            continue
        row["patient_name"] = patient.get("full_name")
        row["patient_phone"] = patient.get("phone")
        row["appointment_number"] = appt.get("appointment_number")
        row["scheduled_at"] = appt.get("scheduled_at")
        result.append(row)
    return result


@router.post(
    "/payments/{payment_id}/receipt",
    response_model=Payment,
    dependencies=[Depends(require_service_token), Depends(rate_limit_receipt_submission)],
)
def submit_receipt(payment_id: UUID, payload: PaymentReceiptSubmit, db: Client = Depends(get_supabase)):
    """Called by n8n after it uploads the patient's receipt image to storage —
    not a staff/dashboard action, so it's gated by the shared service token
    instead of a staff JWT. Also rate-limited since it's an unauthenticated-
    by-a-person endpoint reachable from wherever n8n's server is."""
    return submit_receipt_service(db, str(payment_id), payload.receipt_image_url)


@router.post("/payments/{payment_id}/verify", response_model=Payment)
def approve_payment(
    payment_id: UUID, current: CurrentStaff = Depends(require_permission("payment.manage")), db: Client = Depends(get_supabase)
):
    assert_branch_access(current, "payment.manage", _payment_branch_id(db, str(payment_id)))
    return verify_payment(db, str(payment_id), current.id)


@router.post("/payments/{payment_id}/reject", response_model=Payment)
def decline_payment(
    payment_id: UUID,
    payload: PaymentRejectRequest,
    current: CurrentStaff = Depends(require_permission("payment.manage")),
    db: Client = Depends(get_supabase),
):
    assert_branch_access(current, "payment.manage", _payment_branch_id(db, str(payment_id)))
    return reject_payment(db, str(payment_id), current.id, payload.reason)


@router.post("/payments/{payment_id}/apply-coupon", response_model=Payment)
def apply_coupon_to_payment(
    payment_id: UUID,
    payload: ApplyCouponRequest,
    current: CurrentStaff = Depends(require_permission("payment.manage")),
    db: Client = Depends(get_supabase),
):
    assert_branch_access(current, "payment.manage", _payment_branch_id(db, str(payment_id)))
    return apply_coupon(db, str(payment_id), payload.code)


@router.post("/payments/{payment_id}/refund")
def refund(
    payment_id: UUID,
    payload: RefundRequest,
    current: CurrentStaff = Depends(require_permission("payment.manage")),
    db: Client = Depends(get_supabase),
):
    """FR-PAY: full or partial refund — always a human (staff) decision, per
    safety rule 4.5. Only allowed against a payment that's actually been
    verified as paid."""
    assert_branch_access(current, "payment.manage", _payment_branch_id(db, str(payment_id)))
    return refund_payment(db, str(payment_id), payload.amount, payload.reason, current.id)
