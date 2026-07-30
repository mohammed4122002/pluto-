from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from supabase import Client

from app.core.auth import CurrentStaff, require_permission
from app.core.database import get_supabase
from app.models.schemas import ClinicSettings, ClinicSettingsUpdate

router = APIRouter(prefix="/settings", tags=["settings"])


@router.get("/clinic", response_model=ClinicSettings)
def get_clinic_settings(
    _current: CurrentStaff = Depends(require_permission("clinic_settings.view")), db: Client = Depends(get_supabase)
):
    row = db.table("clinic_settings").select("*").limit(1).single().execute().data
    return ClinicSettings(**row)


@router.patch("/clinic", response_model=ClinicSettings)
def update_clinic_settings(
    payload: ClinicSettingsUpdate,
    _current: CurrentStaff = Depends(require_permission("clinic_settings.update")),
    db: Client = Depends(get_supabase),
):
    existing = db.table("clinic_settings").select("id").limit(1).single().execute().data
    updates = payload.model_dump(exclude_unset=True)
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    row = db.table("clinic_settings").update(updates).eq("id", existing["id"]).execute().data[0]
    return ClinicSettings(**row)
