from uuid import UUID

from fastapi import APIRouter, Depends
from supabase import Client

from app.core.auth import CurrentStaff, allowed_branch_ids, assert_branch_access, require_permission
from app.core.database import get_supabase
from app.models.schemas import Branch, BranchCreate, BranchUpdate

router = APIRouter(prefix="/branches", tags=["branches"])


@router.get("", response_model=list[Branch])
def list_branches(current: CurrentStaff = Depends(require_permission("branch.view")), db: Client = Depends(get_supabase)):
    ids = allowed_branch_ids(current, "branch.view")
    query = db.table("branches").select("*").order("name")
    if ids is not None:
        if not ids:
            return []
        query = query.in_("id", ids)
    return query.execute().data


@router.post("", response_model=Branch)
def create_branch(
    payload: BranchCreate, _current: CurrentStaff = Depends(require_permission("branch.create")), db: Client = Depends(get_supabase)
):
    return db.table("branches").insert(payload.model_dump()).execute().data[0]


@router.get("/{branch_id}", response_model=Branch)
def get_branch(
    branch_id: UUID, current: CurrentStaff = Depends(require_permission("branch.view")), db: Client = Depends(get_supabase)
):
    assert_branch_access(current, "branch.view", str(branch_id))
    return db.table("branches").select("*").eq("id", str(branch_id)).single().execute().data


@router.patch("/{branch_id}", response_model=Branch)
def update_branch(
    branch_id: UUID,
    payload: BranchUpdate,
    current: CurrentStaff = Depends(require_permission("branch.update")),
    db: Client = Depends(get_supabase),
):
    assert_branch_access(current, "branch.update", str(branch_id))
    updates = payload.model_dump(exclude_unset=True)
    return db.table("branches").update(updates).eq("id", str(branch_id)).execute().data[0]
