from uuid import UUID

from fastapi import APIRouter, Depends
from supabase import Client

from app.core.auth import CurrentStaff, require_permission
from app.core.database import get_supabase
from app.models.schemas import Service, ServiceCreate, ServiceUpdate

router = APIRouter(prefix="/services", tags=["services"])


@router.get("", response_model=list[Service])
def list_services(
    branch_id: str | None = None,
    _current: CurrentStaff = Depends(require_permission("service.view")),
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
        return [row["services"] for row in rows if row["services"] and row["services"].get("deleted_at") is None]
    return db.table("services").select("*").is_("deleted_at", "null").order("name").execute().data


@router.post("", response_model=Service)
def create_service(
    payload: ServiceCreate, _current: CurrentStaff = Depends(require_permission("service.create")), db: Client = Depends(get_supabase)
):
    return db.table("services").insert(payload.model_dump()).execute().data[0]


@router.patch("/{service_id}", response_model=Service)
def update_service(
    service_id: UUID,
    payload: ServiceUpdate,
    _current: CurrentStaff = Depends(require_permission("service.update")),
    db: Client = Depends(get_supabase),
):
    updates = payload.model_dump(exclude_unset=True)
    return db.table("services").update(updates).eq("id", str(service_id)).execute().data[0]
