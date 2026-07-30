from uuid import UUID

from fastapi import APIRouter, Depends
from supabase import Client

from app.core.auth import CurrentStaff, require_permission
from app.core.database import get_supabase
from app.models.schemas import CancellationPolicy, CancellationPolicyCreate, CancellationPolicyUpdate

router = APIRouter(prefix="/cancellation-policies", tags=["cancellation-policies"])


@router.get("", response_model=list[CancellationPolicy])
def list_policies(
    _current: CurrentStaff = Depends(require_permission("clinic_settings.view")), db: Client = Depends(get_supabase)
):
    return db.table("cancellation_policies").select("*").execute().data


@router.post("", response_model=CancellationPolicy)
def create_policy(
    payload: CancellationPolicyCreate,
    _current: CurrentStaff = Depends(require_permission("clinic_settings.update")),
    db: Client = Depends(get_supabase),
):
    return db.table("cancellation_policies").insert(payload.model_dump(mode="json")).execute().data[0]


@router.patch("/{policy_id}", response_model=CancellationPolicy)
def update_policy(
    policy_id: UUID,
    payload: CancellationPolicyUpdate,
    _current: CurrentStaff = Depends(require_permission("clinic_settings.update")),
    db: Client = Depends(get_supabase),
):
    updates = payload.model_dump(exclude_unset=True)
    return db.table("cancellation_policies").update(updates).eq("id", str(policy_id)).execute().data[0]
