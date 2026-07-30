from datetime import datetime, timedelta, timezone

from fastapi import HTTPException
from supabase import Client


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
