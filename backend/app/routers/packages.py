from uuid import UUID

from fastapi import APIRouter, Depends
from supabase import Client

from app.core.auth import CurrentStaff, allowed_branch_ids, assert_branch_access, require_permission
from app.core.database import get_supabase
from app.models.schemas import Package, PackageCreate, PackageUpdate, PatientPackage, PatientPackageSell
from app.services.packages import sell_package, use_package_session

router = APIRouter(tags=["packages"])


@router.get("/packages", response_model=list[Package])
def list_packages(
    service_id: str | None = None,
    _current: CurrentStaff = Depends(require_permission("package.view")),
    db: Client = Depends(get_supabase),
):
    query = db.table("packages").select("*").eq("is_active", True)
    if service_id:
        query = query.eq("service_id", service_id)
    return query.execute().data


@router.post("/packages", response_model=Package)
def create_package(
    payload: PackageCreate, _current: CurrentStaff = Depends(require_permission("package.manage")), db: Client = Depends(get_supabase)
):
    return db.table("packages").insert(payload.model_dump(mode="json")).execute().data[0]


@router.patch("/packages/{package_id}", response_model=Package)
def update_package(
    package_id: UUID,
    payload: PackageUpdate,
    _current: CurrentStaff = Depends(require_permission("package.manage")),
    db: Client = Depends(get_supabase),
):
    updates = payload.model_dump(exclude_unset=True)
    return db.table("packages").update(updates).eq("id", str(package_id)).execute().data[0]


@router.get("/patient-packages", response_model=list[PatientPackage])
def list_patient_packages(
    patient_id: str | None = None,
    branch_id: str | None = None,
    current: CurrentStaff = Depends(require_permission("package.view")),
    db: Client = Depends(get_supabase),
):
    query = db.table("patient_packages").select("*").order("purchased_at", desc=True)
    if patient_id:
        query = query.eq("patient_id", patient_id)
    if branch_id:
        assert_branch_access(current, "package.view", branch_id)
        query = query.eq("branch_id", branch_id)
    else:
        allowed = allowed_branch_ids(current, "package.view")
        if allowed is not None:
            if not allowed:
                return []
            query = query.in_("branch_id", allowed)
    return query.execute().data


@router.post("/patient-packages", response_model=PatientPackage)
def sell_patient_package(
    payload: PatientPackageSell,
    current: CurrentStaff = Depends(require_permission("package.manage")),
    db: Client = Depends(get_supabase),
):
    assert_branch_access(current, "package.manage", str(payload.branch_id))
    return sell_package(db, str(payload.patient_id), str(payload.package_id), str(payload.branch_id))


@router.post("/patient-packages/{patient_package_id}/use-session", response_model=PatientPackage)
def use_session(
    patient_package_id: UUID,
    current: CurrentStaff = Depends(require_permission("package.manage")),
    db: Client = Depends(get_supabase),
):
    rows = db.table("patient_packages").select("branch_id").eq("id", str(patient_package_id)).limit(1).execute().data
    if rows:
        assert_branch_access(current, "package.manage", rows[0]["branch_id"])
    return use_package_session(db, str(patient_package_id))
