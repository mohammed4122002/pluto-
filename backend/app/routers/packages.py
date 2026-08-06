from uuid import UUID

from fastapi import APIRouter, Depends
from supabase import Client

from app.core.auth import CurrentStaff, allowed_branch_ids, assert_branch_access, require_permission
from app.core.database import get_supabase
from app.core.service_auth import require_service_token
from app.models.schemas import Package, PackageCreate, PackageUpdate, PatientPackage, PatientPackageSell
from app.services.packages import (
    active_packages_for_patient,
    process_expiring_packages,
    sell_package,
    use_package_session,
)

router = APIRouter(tags=["packages"])


def _with_service_ids(row: dict) -> dict:
    row["service_ids"] = [ps["service_id"] for ps in row.pop("package_services", [])]
    return row


@router.get("/packages", response_model=list[Package])
def list_packages(
    service_id: str | None = None,
    _current: CurrentStaff = Depends(require_permission("package.view")),
    db: Client = Depends(get_supabase),
):
    rows = db.table("packages").select("*, package_services(service_id)").eq("is_active", True).execute().data
    rows = [_with_service_ids(r) for r in rows]
    if service_id:
        # A package with no linked services applies to any service.
        rows = [r for r in rows if not r["service_ids"] or service_id in r["service_ids"]]
    return rows


@router.post("/packages", response_model=Package)
def create_package(
    payload: PackageCreate, _current: CurrentStaff = Depends(require_permission("package.manage")), db: Client = Depends(get_supabase)
):
    data = payload.model_dump(mode="json", exclude={"service_ids"})
    package = db.table("packages").insert(data).execute().data[0]
    if payload.service_ids:
        db.table("package_services").insert(
            [{"package_id": package["id"], "service_id": str(sid)} for sid in payload.service_ids]
        ).execute()
    package["service_ids"] = [str(sid) for sid in payload.service_ids]
    return package


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


@router.get("/patient-packages/active", response_model=list[PatientPackage])
def list_active_patient_packages(
    patient_id: str,
    service_id: str | None = None,
    _current: CurrentStaff = Depends(require_permission("package.view")),
    db: Client = Depends(get_supabase),
):
    """What a patient can book against right now -- active, unexpired,
    with sessions left, optionally narrowed to ones covering a given service."""
    rows = active_packages_for_patient(db, patient_id, service_id)
    for r in rows:
        r.pop("packages", None)
    return rows


@router.post("/patient-packages", response_model=PatientPackage)
def sell_patient_package(
    payload: PatientPackageSell,
    current: CurrentStaff = Depends(require_permission("package.manage")),
    db: Client = Depends(get_supabase),
):
    assert_branch_access(current, "package.manage", str(payload.branch_id))
    return sell_package(db, str(payload.patient_id), str(payload.package_id), str(payload.branch_id))


@router.post("/patient-packages/process-expiring", dependencies=[Depends(require_service_token)])
def process_expiring(db: Client = Depends(get_supabase)):
    """Called by an external scheduler (n8n Cron), same pattern as
    /waitlist/process-expired and /notifications/process-due -- warns once
    when a package is close to expiring, and flips+notifies once when it
    actually has."""
    return process_expiring_packages(db)


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
