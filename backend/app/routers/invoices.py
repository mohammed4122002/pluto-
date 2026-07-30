from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from supabase import Client

from app.core.auth import CurrentStaff, allowed_branch_ids, assert_branch_access, require_permission
from app.core.database import get_supabase
from app.models.schemas import Invoice, InvoiceCreate
from app.services.invoices import issue_invoice

router = APIRouter(prefix="/invoices", tags=["invoices"])


@router.get("", response_model=list[Invoice])
def list_invoices(
    branch_id: str | None = None,
    current: CurrentStaff = Depends(require_permission("invoice.view")),
    db: Client = Depends(get_supabase),
):
    query = db.table("invoices").select("*, appointments(branch_id)").order("issued_at", desc=True)
    rows = query.execute().data

    allowed = allowed_branch_ids(current, "invoice.view")
    result = []
    for row in rows:
        appt = row.pop("appointments", None) or {}
        row_branch = appt.get("branch_id")
        if branch_id and row_branch != branch_id:
            continue
        if allowed is not None and row_branch not in allowed:
            continue
        result.append(row)
    return result


@router.post("", response_model=Invoice)
def create_invoice(
    payload: InvoiceCreate, current: CurrentStaff = Depends(require_permission("invoice.manage")), db: Client = Depends(get_supabase)
):
    appt = db.table("appointments").select("branch_id").eq("id", str(payload.appointment_id)).limit(1).execute().data
    if not appt:
        raise HTTPException(status_code=404, detail="الموعد غير موجود")
    assert_branch_access(current, "invoice.manage", appt[0]["branch_id"])
    return issue_invoice(db, str(payload.appointment_id), payload.discount, current.id)
