import logging
from datetime import datetime, timezone

from fastapi import HTTPException
from supabase import Client

from app.services.notifications import _resolve_channel_for_patient, render_template

logger = logging.getLogger(__name__)

_INSTRUCTIONS_TEMPLATE = (
    "لإتمام حجزك رقم {{appointment_number}}، المبلغ المطلوب {{amount}} {{currency}}.\n"
    "طرق الدفع المتاحة:\n{{methods}}\n"
    "بعد الدفع، ابعتلنا صورة الإيصال هون بنفس المحادثة."
)
_VERIFIED_TEMPLATE = "تم تأكيد استلام دفعتك لحجزك رقم {{appointment_number}}. شكراً إلك!"
_REJECTED_TEMPLATE = "للأسف ما قدرنا نتحقق من الإيصال المرسل لحجزك رقم {{appointment_number}}. السبب: {{reason}}\nيرجى إرسال إيصال واضح مرة أخرى."


def create_payment_for_appointment(db: Client, appointment_id: str) -> None:
    """Best-effort: on booking confirmation, if the service has a price/deposit
    configured, creates a pending payment row and sends instructions. Never
    raises — a missing price just means no payment step is needed yet."""
    try:
        appt = (
            db.table("appointments")
            .select("id, branch_id, patient_id, appointment_number, service_id, services(price, deposit_amount)")
            .eq("id", appointment_id)
            .limit(1)
            .execute()
            .data
        )
        if not appt:
            return
        appt = appt[0]
        service = appt.get("services") or {}
        amount = service.get("deposit_amount") or service.get("price")
        if not amount:
            return

        branch = db.table("branches").select("currency").eq("id", appt["branch_id"]).limit(1).execute().data
        currency = (branch[0]["currency"] if branch else None) or ""

        payment = (
            db.table("payments")
            .insert(
                {
                    "appointment_id": appointment_id,
                    "patient_id": appt["patient_id"],
                    "amount": amount,
                    "currency": currency,
                    "payment_instructions_sent_at": datetime.now(timezone.utc).isoformat(),
                }
            )
            .execute()
            .data[0]
        )

        methods = (
            db.table("payment_methods")
            .select("display_name, account_number")
            .or_(f"branch_id.eq.{appt['branch_id']},branch_id.is.null")
            .eq("is_active", True)
            .execute()
            .data
        )
        methods_text = "\n".join(f"- {m['display_name']}: {m.get('account_number') or ''}" for m in methods) or "تواصل معنا لمعرفة طرق الدفع."

        channel = _resolve_channel_for_patient(db, appt["patient_id"])
        if channel and channel.get("outbound_webhook_url"):
            message = render_template(
                _INSTRUCTIONS_TEMPLATE,
                {
                    "appointment_number": appt.get("appointment_number", ""),
                    "amount": amount,
                    "currency": currency,
                    "methods": methods_text,
                },
            )
            _deliver(db, channel, appt["patient_id"], message)
        else:
            logger.info("No channel to deliver payment instructions for appointment_id=%s", appointment_id)

        return payment
    except Exception:
        logger.exception("create_payment_for_appointment failed for appointment_id=%s", appointment_id)


def verify_payment(db: Client, payment_id: str, staff_id: str) -> dict:
    payment = db.table("payments").select("*").eq("id", payment_id).limit(1).execute().data[0]
    updated = (
        db.table("payments")
        .update({"status": "verified", "verified_by": staff_id, "verified_at": datetime.now(timezone.utc).isoformat()})
        .eq("id", payment_id)
        .execute()
        .data[0]
    )

    if payment.get("patient_package_id"):
        db.table("patient_packages").update({"status": "active"}).eq("id", payment["patient_package_id"]).execute()

    if payment.get("appointment_id"):
        db.table("appointments").update({"payment_status": "paid", "paid_amount": payment["amount"]}).eq(
            "id", payment["appointment_id"]
        ).execute()

        appt = (
            db.table("appointments")
            .select("appointment_number, patient_id")
            .eq("id", payment["appointment_id"])
            .limit(1)
            .execute()
            .data
        )
        if appt:
            channel = _resolve_channel_for_patient(db, appt[0]["patient_id"])
            if channel and channel.get("outbound_webhook_url"):
                message = render_template(_VERIFIED_TEMPLATE, {"appointment_number": appt[0].get("appointment_number", "")})
                _deliver(db, channel, appt[0]["patient_id"], message)

    return updated


def reject_payment(db: Client, payment_id: str, staff_id: str, reason: str) -> dict:
    payment = db.table("payments").select("*").eq("id", payment_id).limit(1).execute().data[0]
    updated = (
        db.table("payments")
        .update(
            {
                "status": "rejected",
                "verified_by": staff_id,
                "verified_at": datetime.now(timezone.utc).isoformat(),
                "rejection_reason": reason,
            }
        )
        .eq("id", payment_id)
        .execute()
        .data[0]
    )

    if payment.get("patient_package_id"):
        db.table("patient_packages").update({"status": "cancelled"}).eq("id", payment["patient_package_id"]).execute()

    if payment.get("appointment_id"):
        appt = (
            db.table("appointments")
            .select("appointment_number, patient_id")
            .eq("id", payment["appointment_id"])
            .limit(1)
            .execute()
            .data
        )
        if appt:
            channel = _resolve_channel_for_patient(db, appt[0]["patient_id"])
            if channel and channel.get("outbound_webhook_url"):
                message = render_template(
                    _REJECTED_TEMPLATE, {"appointment_number": appt[0].get("appointment_number", ""), "reason": reason}
                )
                _deliver(db, channel, appt[0]["patient_id"], message)

    return updated


def apply_coupon(db: Client, payment_id: str, code: str) -> dict:
    payment = db.table("payments").select("*").eq("id", payment_id).limit(1).execute().data
    if not payment:
        raise HTTPException(status_code=404, detail="الدفعة غير موجودة")
    payment = payment[0]
    if payment["status"] != "pending":
        raise HTTPException(status_code=409, detail="لا يمكن تطبيق كوبون إلا على دفعة لم تُسدَّد بعد")

    coupon = db.table("coupons").select("*").eq("code", code).eq("is_active", True).limit(1).execute().data
    if not coupon:
        raise HTTPException(status_code=404, detail="كوبون غير صالح")
    coupon = coupon[0]

    now = datetime.now(timezone.utc)
    if coupon.get("valid_from") and now < datetime.fromisoformat(coupon["valid_from"]):
        raise HTTPException(status_code=400, detail="الكوبون لم يبدأ العمل به بعد")
    if coupon.get("valid_to") and now > datetime.fromisoformat(coupon["valid_to"]):
        raise HTTPException(status_code=400, detail="انتهت صلاحية الكوبون")
    if coupon.get("max_uses") is not None and coupon["used_count"] >= coupon["max_uses"]:
        raise HTTPException(status_code=400, detail="استُنفد عدد مرات استخدام الكوبون")

    if coupon["discount_type"] == "fixed":
        discount = coupon["discount_value"]
    else:
        discount = payment["amount"] * coupon["discount_value"] / 100
    new_amount = max(payment["amount"] - discount, 0)

    updated = (
        db.table("payments")
        .update({"amount": new_amount, "coupon_id": coupon["id"]})
        .eq("id", payment_id)
        .execute()
        .data[0]
    )
    db.table("coupons").update({"used_count": coupon["used_count"] + 1}).eq("id", coupon["id"]).execute()
    return updated


def refund_payment(db: Client, payment_id: str, amount: float, reason: str, staff_id: str) -> dict:
    payment = db.table("payments").select("*").eq("id", payment_id).limit(1).execute().data
    if not payment:
        raise HTTPException(status_code=404, detail="الدفعة غير موجودة")
    payment = payment[0]
    if payment["status"] not in ("verified", "partially_refunded"):
        raise HTTPException(status_code=409, detail="لا يمكن استرجاع دفعة لم يتم تأكيد استلامها")
    if amount <= 0:
        raise HTTPException(status_code=400, detail="مبلغ الاسترجاع يجب أن يكون أكبر من صفر")

    already_refunded = db.table("refunds").select("amount").eq("payment_id", payment_id).execute().data
    total_refunded = sum(r["amount"] for r in already_refunded)
    if total_refunded + amount > payment["amount"]:
        raise HTTPException(status_code=400, detail="مبلغ الاسترجاع يتجاوز قيمة الدفعة")

    refund = (
        db.table("refunds")
        .insert({"payment_id": payment_id, "amount": amount, "reason": reason, "processed_by": staff_id})
        .execute()
        .data[0]
    )
    new_status = "refunded" if total_refunded + amount >= payment["amount"] else "partially_refunded"
    db.table("payments").update({"status": new_status}).eq("id", payment_id).execute()

    return refund


def submit_receipt(db: Client, payment_id: str, receipt_image_url: str) -> dict:
    rows = (
        db.table("payments")
        .update(
            {
                "status": "receipt_submitted",
                "receipt_image_url": receipt_image_url,
                "submitted_at": datetime.now(timezone.utc).isoformat(),
            }
        )
        .eq("id", payment_id)
        .execute()
        .data
    )
    if not rows:
        raise HTTPException(status_code=404, detail="الدفعة غير موجودة")
    return rows[0]


def attach_receipt_from_inbound_media(db: Client, patient_id: str, media_url: str) -> dict | None:
    """Receipt capture in chat: a patient sending a photo in the same
    conversation right after being asked for one should count as submitting
    it — finds their most recent payment still waiting on a receipt
    (pending, or rejected and being retried) and attaches this image to it.
    Returns None (and attaches nothing) if there's no such payment, since an
    unrelated photo shouldn't silently attach to something stale."""
    rows = (
        db.table("payments")
        .select("id, created_at")
        .eq("patient_id", patient_id)
        .in_("status", ["pending", "rejected"])
        .order("created_at", desc=True)
        .limit(1)
        .execute()
        .data
    )
    if not rows:
        return None
    return submit_receipt(db, rows[0]["id"], media_url)


def _deliver(db: Client, channel: dict, patient_id: str, message: str) -> None:
    import httpx

    patient = db.table("patients").select("phone").eq("id", patient_id).limit(1).execute().data
    phone = patient[0]["phone"] if patient else None
    try:
        httpx.post(
            channel["outbound_webhook_url"],
            json={"recipient": phone, "message": message, "channel_identifier": channel["identifier"]},
            timeout=10,
        )
    except httpx.HTTPError:
        logger.exception("payment notification delivery failed")
