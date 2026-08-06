import logging
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException
from supabase import Client

from app.services.notifications import _resolve_channel_for_patient, render_template
from app.services.payments import _deliver

logger = logging.getLogger(__name__)

_EXPIRY_REMINDER_DAYS = 3
_EXPIRY_REMINDER_TEMPLATE = (
    "باقتك '{{package_name}}' بتنتهي بتاريخ {{expires_at}} وبعدها {{sessions_remaining}} جلسات. "
    "تواصلي معنا إذا حابة تستخدميها قبل ما تنتهي."
)
_RENEWAL_TEMPLATE = (
    "انتهت صلاحية باقتك '{{package_name}}'. إذا حابة تجددي باقة مشابهة، تواصلي معنا وبنرتبلك إياها."
)


def sell_package(db: Client, patient_id: str, package_id: str, branch_id: str) -> dict:
    """Creates the patient's package instance (inactive — 0 usable sessions
    until payment clears) plus a payment row for its price, reusing the same
    manual-receipt-review flow as any other payment. Session count only
    becomes usable once staff verifies the payment (see verify_payment)."""
    package = db.table("packages").select("*").eq("id", package_id).eq("is_active", True).limit(1).execute().data
    if not package:
        raise HTTPException(status_code=404, detail="الباقة غير موجودة أو غير مفعّلة")
    package = package[0]

    expires_at = datetime.now(timezone.utc) + timedelta(days=package["validity_days"])
    patient_package = (
        db.table("patient_packages")
        .insert(
            {
                "patient_id": patient_id,
                "package_id": package_id,
                "branch_id": branch_id,
                "sessions_remaining": package["sessions_count"],
                "status": "pending_payment",
                "expires_at": expires_at.isoformat(),
            }
        )
        .execute()
        .data[0]
    )

    branch = db.table("branches").select("currency").eq("id", branch_id).limit(1).execute().data
    currency = (branch[0]["currency"] if branch else None) or ""

    db.table("payments").insert(
        {
            "patient_id": patient_id,
            "patient_package_id": patient_package["id"],
            "amount": package["price"],
            "currency": currency,
            "payment_type": "package",
            "payment_instructions_sent_at": datetime.now(timezone.utc).isoformat(),
        }
    ).execute()

    return patient_package


def active_packages_for_patient(db: Client, patient_id: str, service_id: str | None = None) -> list[dict]:
    """Active, non-expired, unspent patient packages -- what the AI/dashboard
    should offer as "book against this instead of paying". A package with no
    rows in package_services applies to any service (same "any service"
    meaning the old single service_id=null had)."""
    now = datetime.now(timezone.utc).isoformat()
    rows = (
        db.table("patient_packages")
        .select("*, packages(name, package_services(service_id))")
        .eq("patient_id", patient_id)
        .eq("status", "active")
        .gt("sessions_remaining", 0)
        .gte("expires_at", now)
        .order("expires_at")
        .execute()
        .data
    )
    if not service_id:
        return rows
    matching = []
    for row in rows:
        service_ids = [ps["service_id"] for ps in (row.get("packages") or {}).get("package_services", [])]
        if not service_ids or service_id in service_ids:
            matching.append(row)
    return matching


def deduct_package_session_for_appointment(db: Client, appointment_id: str) -> None:
    """Best-effort: an appointment only consumes a package session if it was
    explicitly booked against one (appointments.patient_package_id set at
    booking time) -- never inferred after the fact from a matching service,
    since a patient can have an active package for a service and still
    separately pay full price for one visit."""
    try:
        appt = db.table("appointments").select("patient_package_id").eq("id", appointment_id).limit(1).execute().data
        if not appt or not appt[0].get("patient_package_id"):
            return
        use_package_session(db, appt[0]["patient_package_id"])
    except Exception:
        logger.exception("deduct_package_session_for_appointment failed for appointment_id=%s", appointment_id)


def _notify_patient(db: Client, patient_id: str, message: str) -> None:
    channel = _resolve_channel_for_patient(db, patient_id)
    if channel and channel.get("outbound_webhook_url"):
        _deliver(db, channel, patient_id, message)


def process_expiring_packages(db: Client) -> dict:
    """Meant to be polled every few minutes by an external scheduler (same
    pattern as backend/app/routers/notifications.py's process-due and
    recalls' invitations job) -- nothing else ever calls this, so without a
    poller a package would just quietly run out with no warning. Two
    independent sweeps: warn once when a package is close to expiring, and
    flip+notify once when it actually has (lazily, previously only checked
    when a session was used, so a package nobody tried to use after expiry
    stayed 'active' forever)."""
    now = datetime.now(timezone.utc)
    reminder_cutoff = (now + timedelta(days=_EXPIRY_REMINDER_DAYS)).isoformat()

    reminded = 0
    soon_expiring = (
        db.table("patient_packages")
        .select("id, patient_id, sessions_remaining, expires_at, packages(name)")
        .eq("status", "active")
        .gt("sessions_remaining", 0)
        .lte("expires_at", reminder_cutoff)
        .gt("expires_at", now.isoformat())
        .is_("expiry_reminder_sent_at", "null")
        .execute()
        .data
    )
    for pp in soon_expiring:
        try:
            message = render_template(
                _EXPIRY_REMINDER_TEMPLATE,
                {
                    "package_name": (pp.get("packages") or {}).get("name") or "",
                    "expires_at": pp["expires_at"][:10],
                    "sessions_remaining": pp["sessions_remaining"],
                },
            )
            _notify_patient(db, pp["patient_id"], message)
            db.table("patient_packages").update({"expiry_reminder_sent_at": now.isoformat()}).eq("id", pp["id"]).execute()
            reminded += 1
        except Exception:
            logger.exception("expiry reminder failed for patient_package_id=%s", pp["id"])

    expired = 0
    newly_expired = (
        db.table("patient_packages")
        .select("id, patient_id, packages(name)")
        .eq("status", "active")
        .lt("expires_at", now.isoformat())
        .execute()
        .data
    )
    for pp in newly_expired:
        try:
            db.table("patient_packages").update({"status": "expired"}).eq("id", pp["id"]).execute()
            message = render_template(_RENEWAL_TEMPLATE, {"package_name": (pp.get("packages") or {}).get("name") or ""})
            _notify_patient(db, pp["patient_id"], message)
            expired += 1
        except Exception:
            logger.exception("expiry/renewal notice failed for patient_package_id=%s", pp["id"])

    return {"reminded": reminded, "expired": expired}


def use_package_session(db: Client, patient_package_id: str) -> dict:
    rows = db.table("patient_packages").select("*").eq("id", patient_package_id).limit(1).execute().data
    if not rows:
        raise HTTPException(status_code=404, detail="الباقة غير موجودة")
    pp = rows[0]
    if pp["status"] != "active":
        raise HTTPException(status_code=409, detail="الباقة غير مفعّلة بعد أو ملغاة")
    if pp["sessions_remaining"] <= 0:
        raise HTTPException(status_code=409, detail="لا يوجد جلسات متبقية بهذه الباقة")
    if datetime.fromisoformat(pp["expires_at"]) < datetime.now(timezone.utc):
        db.table("patient_packages").update({"status": "expired"}).eq("id", patient_package_id).execute()
        raise HTTPException(status_code=409, detail="انتهت صلاحية هذه الباقة")

    updated = (
        db.table("patient_packages")
        .update({"sessions_remaining": pp["sessions_remaining"] - 1})
        .eq("id", patient_package_id)
        .execute()
        .data[0]
    )
    return updated
