import secrets
from datetime import datetime, timezone

from fastapi import HTTPException
from supabase import Client


def generate_invoice_number() -> str:
    today = datetime.now(timezone.utc).strftime("%Y%m%d")
    return f"INV-{today}-{secrets.token_hex(3).upper()}"


def issue_invoice(db: Client, appointment_id: str, discount: float, issued_by: str) -> dict:
    appt = (
        db.table("appointments")
        .select("patient_id, services(price)")
        .eq("id", appointment_id)
        .limit(1)
        .execute()
        .data
    )
    if not appt:
        raise HTTPException(status_code=404, detail="الموعد غير موجود")
    appt = appt[0]
    subtotal = (appt.get("services") or {}).get("price") or 0
    total = max(subtotal - discount, 0)

    return (
        db.table("invoices")
        .insert(
            {
                "appointment_id": appointment_id,
                "patient_id": appt["patient_id"],
                "invoice_number": generate_invoice_number(),
                "subtotal": subtotal,
                "discount": discount,
                "total": total,
                "issued_by": issued_by,
            }
        )
        .execute()
        .data[0]
    )
