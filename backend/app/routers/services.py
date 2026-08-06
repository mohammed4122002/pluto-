from uuid import UUID

from fastapi import APIRouter, Depends
from supabase import Client

from app.core.auth import CurrentStaff, require_permission
from app.core.database import get_supabase
from app.core.scoping import StaffScope, get_staff_scope
from app.models.schemas import Service, ServiceCreate, ServiceUpdate

router = APIRouter(prefix="/services", tags=["services"])


def _attach_doctor_ids(db: Client, services: list[dict]) -> list[dict]:
    if not services:
        return services
    service_ids = [s["id"] for s in services]
    links = db.table("service_doctors").select("service_id, staff_id").in_("service_id", service_ids).execute().data
    by_service: dict[str, list[str]] = {}
    for link in links:
        by_service.setdefault(link["service_id"], []).append(link["staff_id"])
    for s in services:
        s["doctor_ids"] = by_service.get(s["id"], [])
    return services


@router.get("", response_model=list[Service])
def list_services(
    branch_id: str | None = None,
    _current: CurrentStaff = Depends(require_permission("service.view")),
    scope: StaffScope = Depends(get_staff_scope),
    db: Client = Depends(get_supabase),
):
    if branch_id:
        rows = (
            db.table("branch_services")
            .select("service_id, services(*)")
            .eq("branch_id", branch_id)
            .execute()
            .data
        )
        services = [row["services"] for row in rows if row["services"] and row["services"].get("deleted_at") is None]
    else:
        services = db.table("services").select("*").is_("deleted_at", "null").order("name").execute().data
    services = _attach_doctor_ids(db, services)
    # A self-scoped role provides specific services, they don't own the
    # catalogue -- narrowing here rather than in the browser.
    if scope.is_self_scoped:
        services = [s for s in services if scope.staff_id in s["doctor_ids"]]
    return services


@router.post("", response_model=Service)
def create_service(
    payload: ServiceCreate, _current: CurrentStaff = Depends(require_permission("service.create")), db: Client = Depends(get_supabase)
):
    data = payload.model_dump(exclude={"doctor_ids"})
    created = db.table("services").insert(data).execute().data[0]
    if payload.doctor_ids:
        db.table("service_doctors").insert(
            [{"service_id": created["id"], "staff_id": str(sid)} for sid in payload.doctor_ids]
        ).execute()
    return _attach_doctor_ids(db, [created])[0]


@router.patch("/{service_id}", response_model=Service)
def update_service(
    service_id: UUID,
    payload: ServiceUpdate,
    _current: CurrentStaff = Depends(require_permission("service.update")),
    db: Client = Depends(get_supabase),
):
    updates = payload.model_dump(exclude_unset=True)
    updated = db.table("services").update(updates).eq("id", str(service_id)).execute().data[0]
    return _attach_doctor_ids(db, [updated])[0]


@router.post("/{service_id}/doctors", response_model=Service)
def add_service_doctor(
    service_id: UUID,
    staff_id: UUID,
    _current: CurrentStaff = Depends(require_permission("service.update")),
    db: Client = Depends(get_supabase),
):
    db.table("service_doctors").upsert({"service_id": str(service_id), "staff_id": str(staff_id)}).execute()
    service = db.table("services").select("*").eq("id", str(service_id)).limit(1).execute().data
    return _attach_doctor_ids(db, service)[0]


@router.delete("/{service_id}/doctors/{staff_id}")
def remove_service_doctor(
    service_id: UUID,
    staff_id: UUID,
    _current: CurrentStaff = Depends(require_permission("service.update")),
    db: Client = Depends(get_supabase),
):
    db.table("service_doctors").delete().eq("service_id", str(service_id)).eq("staff_id", str(staff_id)).execute()
    return {"deleted": True}
