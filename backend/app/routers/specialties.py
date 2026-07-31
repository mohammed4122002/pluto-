from fastapi import APIRouter, Depends
from supabase import Client

from app.core.auth import CurrentStaff, require_permission
from app.core.database import get_supabase
from app.models.schemas import Specialty, SpecialtyCreate

router = APIRouter(prefix="/specialties", tags=["specialties"])


@router.get("", response_model=list[Specialty])
def list_specialties(
    _current: CurrentStaff = Depends(require_permission("service.view")),
    db: Client = Depends(get_supabase),
):
    return db.table("specialties").select("*").eq("is_active", True).order("name_ar").execute().data


@router.post("", response_model=Specialty)
def create_specialty(
    payload: SpecialtyCreate,
    _current: CurrentStaff = Depends(require_permission("service.create")),
    db: Client = Depends(get_supabase),
):
    return db.table("specialties").insert(payload.model_dump(mode="json")).execute().data[0]
