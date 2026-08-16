import logging
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException
from supabase import Client

from app.services.channel_identity import resolve_delivery_recipient
from app.services.notifications import _resolve_channel_for_patient, render_template

logger = logging.getLogger(__name__)

_INSTRUCTIONS_TEMPLATE = (
    "لإتمام حجزك رقم {{appointment_number}}، المبلغ المطلوب {{amount}} {{currency}}.\n"
    "طرق الدفع المتاحة:\n{{methods}}\n"
    "بعد الدفع، ابعتلنا صورة الإيصال هون بنفس المحادثة."
)
_VERIFIED_TEMPLATE = "تم تأكيد استلام دفعتك لحجزك رقم {{appointment_number}}. شكراً إلك!"
_REJECTED_TEMPLATE = "للأسف ما قدرنا نتحقق من الإيصال المرسل لحجزك رقم {{appointment_number}}. السبب: {{reason}}\nيرجى إرسال إيصال واضح مرة أخرى."
_RECEIPT_RECEIVED_TEMPLATE = "وصلنا إيصال الدفع وهو قيد المراجعة الآن — رح نأكدلك خلال وقت قصير."

# How long after being asked for a receipt a photo still plausibly answers
# that ask. Wide enough for someone who pays a day later and sends the photo
# once they're back near their phone, narrow enough that a payment nobody
# ever followed up on stops silently claiming whatever unrelated photo the
# patient happens to send next.
_RECEIPT_MATCH_WINDOW = timedelta(hours=72)


def _parse_timestamp(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def create_payment_for_appointment(db: Client, appointment_id: str) -> None:
    """Best-effort: on booking confirmation, if the service has a price/deposit
    configured, creates a pending payment row and sends instructions. Never
    raises — a missing price just means no payment step is needed yet."""
    try:
        appt = (
            db.table("appointments")
            .select("id, branch_id, patient_id, appointment_number, service_id, patient_package_id, services(price, deposit_amount)")
            .eq("id", appointment_id)
            .limit(1)
            .execute()
            .data
        )
        if not appt:
            return
        appt = appt[0]
        if appt.get("patient_package_id"):
            # Already billed against a package at booking time -- no fresh
            # payment to request, the visit is covered by a session there.
            return

        existing = db.table("payments").select("id").eq("appointment_id", appointment_id).limit(1).execute().data
        if existing:
            # Confirming an appointment fires this hook, and with the
            # deposit gate on, confirmation happens *because* a payment was
            # just verified -- charging again here would bill the patient
            # twice for one booking.
            return
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
            .select("appointment_number, patient_id, status")
            .eq("id", payment["appointment_id"])
            .limit(1)
            .execute()
            .data
        )
        if appt and appt[0].get("status") == "pending_payment":
            # The booking was deliberately held unconfirmed until the money
            # arrived (clinic_settings.require_deposit_to_confirm). This is
            # the moment it becomes real -- without it the patient pays and
            # the appointment sits pending forever.
            # Imported here, not at module scope: app.services.appointments
            # imports create_payment_for_appointment from this module, so a
            # top-level import would be circular.
            from app.services.appointments import apply_status_transition

            apply_status_transition(db, payment["appointment_id"], "confirmed", "تم تأكيد الدفع", staff_id)
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
    payment = (
        db.table("payments")
        .select("*, appointments(branch_id, service_id)")
        .eq("id", payment_id)
        .limit(1)
        .execute()
        .data
    )
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

    appt = payment.get("appointments") or {}
    if coupon.get("branch_id") and appt.get("branch_id") and coupon["branch_id"] != appt["branch_id"]:
        raise HTTPException(status_code=400, detail="هذا الكوبون غير صالح لهذا الفرع")
    # coupon_services holds the group of services a coupon is limited to; no
    # rows means it applies to everything. coupons.service_id is the older
    # single-service form, kept working for a coupon created before the
    # migration and never backfilled.
    allowed_services = {
        row["service_id"]
        for row in db.table("coupon_services").select("service_id").eq("coupon_id", coupon["id"]).execute().data
    }
    if coupon.get("service_id"):
        allowed_services.add(coupon["service_id"])
    if allowed_services and appt.get("service_id") and appt["service_id"] not in allowed_services:
        raise HTTPException(status_code=400, detail="هذا الكوبون غير صالح لهذه الخدمة")

    if coupon["customer_scope"] != "all":
        prior_visit = (
            db.table("appointments")
            .select("id")
            .eq("patient_id", payment["patient_id"])
            .in_("status", ["completed", "checked_in", "checked_out", "confirmed"])
            .limit(1)
            .execute()
            .data
        )
        is_existing = bool(prior_visit)
        if coupon["customer_scope"] == "new" and is_existing:
            raise HTTPException(status_code=400, detail="هذا الكوبون لعملاء جدد فقط")
        if coupon["customer_scope"] == "existing" and not is_existing:
            raise HTTPException(status_code=400, detail="هذا الكوبون للعملاء الحاليين فقط")

    if coupon.get("per_customer_limit") is not None:
        redemptions = (
            db.table("coupon_redemptions")
            .select("id")
            .eq("coupon_id", coupon["id"])
            .eq("patient_id", payment["patient_id"])
            .execute()
            .data
        )
        if len(redemptions) >= coupon["per_customer_limit"]:
            raise HTTPException(status_code=400, detail="استخدمت هذا الكوبون الحد الأقصى المسموح لك")

    if coupon["discount_type"] == "fixed":
        new_amount = max(payment["amount"] - coupon["discount_value"], 0)
    elif coupon["discount_type"] == "percentage":
        new_amount = max(payment["amount"] - payment["amount"] * coupon["discount_value"] / 100, 0)
    elif coupon["discount_type"] in ("free_session", "free_consultation"):
        new_amount = 0
    else:
        # service_upgrade has no automatic price change -- what "upgrade" means
        # is service-specific, so staff/the AI apply it themselves; the coupon
        # is still recorded as redeemed against this payment.
        new_amount = payment["amount"]

    updated = (
        db.table("payments")
        .update({"amount": new_amount, "coupon_id": coupon["id"]})
        .eq("id", payment_id)
        .execute()
        .data[0]
    )
    db.table("coupons").update({"used_count": coupon["used_count"] + 1}).eq("id", coupon["id"]).execute()
    db.table("coupon_redemptions").insert(
        {"coupon_id": coupon["id"], "patient_id": payment["patient_id"], "payment_id": payment_id}
    ).execute()
    return updated


def refund_payment(db: Client, payment_id: str, amount: float, reason: str, staff_id: str | None) -> dict:
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
    fully_refunded = total_refunded + amount >= payment["amount"]
    new_status = "refunded" if fully_refunded else "partially_refunded"
    db.table("payments").update({"status": new_status}).eq("id", payment_id).execute()

    if fully_refunded and payment.get("patient_package_id"):
        # A package payment refunded in full means the clinic gave the money
        # back — the package must not keep working. Without this, a fully
        # refunded package stayed 'active' with its sessions untouched
        # (confirmed in an audit: refunded 60/60, package still active with
        # 2 sessions left), letting the patient keep using something the
        # clinic was no longer paid for. Left alone on a partial refund,
        # which needs staff judgment about how much of the package survives.
        db.table("patient_packages").update({"status": "cancelled"}).eq(
            "id", payment["patient_package_id"]
        ).eq("status", "active").execute()

    return refund


_CANCELLATION_REFUND_TEMPLATE = (
    "بخصوص موعدك رقم {{appointment_number}}: تم استرجاع {{amount}} {{currency}} من المبلغ المدفوع مسبقاً."
)
_CANCELLATION_NET_REFUND_TEMPLATE = (
    "بخصوص موعدك رقم {{appointment_number}}: من المبلغ المدفوع مسبقاً، تم خصم رسوم إلغاء بقيمة "
    "{{fee}} {{currency}} وتم استرجاع الباقي وقيمته {{amount}} {{currency}}."
)
_CANCELLATION_FEE_DUE_TEMPLATE = (
    "بخصوص موعدك رقم {{appointment_number}}: يترتب عليك رسم إلغاء بقيمة {{fee}} {{currency}}."
)
_CANCELLATION_PARTIAL_FEE_DUE_TEMPLATE = (
    "بخصوص موعدك رقم {{appointment_number}}: المبلغ المدفوع مسبقاً غطى جزءاً من رسم الإلغاء، "
    "والمتبقي عليك {{fee}} {{currency}}."
)


def charge_cancellation_fee(db: Client, appointment: dict, fee: float) -> dict:
    branch = db.table("branches").select("currency").eq("id", appointment["branch_id"]).limit(1).execute().data
    currency = (branch[0]["currency"] if branch else None) or ""
    return (
        db.table("payments")
        .insert(
            {
                "appointment_id": appointment["id"],
                "patient_id": appointment["patient_id"],
                "amount": fee,
                "currency": currency,
                "payment_type": "cancellation_fee",
                "payment_instructions_sent_at": datetime.now(timezone.utc).isoformat(),
            }
        )
        .execute()
        .data[0]
    )


def settle_appointment_fee(db: Client, appointment: dict, fee: float, processed_by: str | None) -> dict:
    """Nets a cancellation/no-show fee against whatever the patient already
    paid for this appointment instead of stacking a brand-new charge next to
    an untouched deposit. A JOD 10 deposit against a JOD 4 fee means a JOD 6
    refund, not a JOD 4 bill sitting next to a forgotten JOD 10. Only the
    shortfall becomes a new charge, only the surplus a refund -- and the
    patient is told the exact number either way, automatically.

    processed_by may be None: this runs from contexts with no staff member
    present at all (the AI chatbot cancelling on the patient's behalf), and
    that's a legitimate "settled automatically" attribution, not a bug."""
    collected = (
        db.table("payments")
        .select("*")
        .eq("appointment_id", appointment["id"])
        .in_("status", ["verified", "partially_refunded"])
        .neq("payment_type", "cancellation_fee")
        .execute()
        .data
    )

    remaining_fee = round(fee, 2)
    refunded_total = 0.0
    currency = ""
    for payment in collected:
        currency = payment.get("currency") or currency
        already_refunded = sum(
            r["amount"] for r in db.table("refunds").select("amount").eq("payment_id", payment["id"]).execute().data
        )
        available = payment["amount"] - already_refunded
        if available <= 0:
            continue
        refund_amount = round(max(available - remaining_fee, 0), 2)
        remaining_fee = round(max(remaining_fee - available, 0), 2)
        if refund_amount > 0:
            refund_payment(db, payment["id"], refund_amount, "استرجاع تلقائي بعد إلغاء/عدم حضور الموعد", processed_by)
            refunded_total += refund_amount

    if remaining_fee > 0:
        charge_cancellation_fee(db, appointment, remaining_fee)
        if not currency:
            branch = db.table("branches").select("currency").eq("id", appointment["branch_id"]).limit(1).execute().data
            currency = (branch[0]["currency"] if branch else None) or ""

    refunded_total = round(refunded_total, 2)
    _notify_patient_of_settlement(db, appointment, fee, remaining_fee, refunded_total, currency)

    return {"fee_charged": fee, "fee_pending": remaining_fee, "refunded": refunded_total}


def _notify_patient_of_settlement(
    db: Client, appointment: dict, fee: float, fee_pending: float, refunded: float, currency: str
) -> None:
    if fee <= 0 and refunded <= 0:
        return
    if refunded > 0 and fee > 0:
        template, ctx = _CANCELLATION_NET_REFUND_TEMPLATE, {"fee": fee - refunded if fee_pending else fee}
    elif refunded > 0:
        template, ctx = _CANCELLATION_REFUND_TEMPLATE, {}
    elif fee_pending > 0 and fee_pending < fee:
        template, ctx = _CANCELLATION_PARTIAL_FEE_DUE_TEMPLATE, {"fee": fee_pending}
    else:
        template, ctx = _CANCELLATION_FEE_DUE_TEMPLATE, {"fee": fee_pending}

    channel = _resolve_channel_for_patient(db, appointment["patient_id"])
    if not channel or not channel.get("outbound_webhook_url"):
        return
    message = render_template(
        template,
        {
            "appointment_number": appointment.get("appointment_number", ""),
            "amount": refunded,
            "currency": currency,
            **ctx,
        },
    )
    _deliver(db, channel, appointment["patient_id"], message)


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
    payment = rows[0]

    channel = _resolve_channel_for_patient(db, payment["patient_id"])
    if channel and channel.get("outbound_webhook_url"):
        _deliver(db, channel, payment["patient_id"], _RECEIPT_RECEIVED_TEMPLATE)

    return payment


def attach_receipt_from_inbound_media(db: Client, patient_id: str, media_url: str) -> dict | None:
    """Receipt capture in chat: a patient sending a photo in the same
    conversation right after being asked for one should count as submitting
    it — finds their most recent payment still waiting on a receipt
    (pending, or rejected and being retried) and attaches this image to it.
    Returns None (and attaches nothing) if there's no such payment, since an
    unrelated photo shouldn't silently attach to something stale.

    "Stale" is checked, not just claimed: the docstring above always said an
    unrelated photo shouldn't attach to something stale, but the code never
    actually looked at *when* the patient was asked for a receipt, only
    *whether* some pending/rejected payment existed at all — confirmed live,
    a patient with an old unrelated pending payment sent a photo of an
    injury and was told "we received your payment receipt, reviewing it
    now." Only a payment the patient was asked about within
    _RECEIPT_MATCH_WINDOW counts as "right after" now."""
    rows = (
        db.table("payments")
        .select("id, status, payment_instructions_sent_at, verified_at, created_at")
        .eq("patient_id", patient_id)
        .in_("status", ["pending", "rejected"])
        .order("created_at", desc=True)
        .limit(1)
        .execute()
        .data
    )
    if not rows:
        return None
    payment = rows[0]
    # A "pending" payment was asked for via payment_instructions_sent_at; a
    # "rejected" one via verified_at, which reject_payment stamps as the
    # moment staff rejected it and the patient was told to resend (see
    # reject_payment above — verified_at is reused for both verify and
    # reject, there is no separate rejected_at column).
    asked_at = payment.get("payment_instructions_sent_at") if payment["status"] == "pending" else payment.get("verified_at")
    if not asked_at or _parse_timestamp(asked_at) < datetime.now(timezone.utc) - _RECEIPT_MATCH_WINDOW:
        return None
    return submit_receipt(db, payment["id"], media_url)


def _deliver(db: Client, channel: dict, patient_id: str, message: str) -> None:
    import httpx

    recipient = resolve_delivery_recipient(db, channel["id"], patient_id)
    try:
        httpx.post(
            channel["outbound_webhook_url"],
            json={"recipient": recipient, "message": message, "channel_identifier": channel["identifier"]},
            timeout=10,
        )
    except httpx.HTTPError:
        logger.exception("payment notification delivery failed")
