from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from supabase import Client

from app.core.auth import CurrentStaff, allowed_branch_ids, require_permission
from app.core.database import get_supabase
from app.models.schemas import (
    Guardian,
    MergePatientsRequest,
    Patient,
    PatientCreate,
    PatientCreateResult,
    PatientDuplicate,
    PatientGuardianAttach,
    PatientGuardianLink,
    PatientTag,
    PatientTagRequest,
    PatientUpdate,
)
from app.services.patient_management import dismiss_duplicate, find_duplicates_for, is_minor, merge_patients

router = APIRouter(tags=["patients"])


def _patient_ids_visible_in_branches(db: Client, branch_ids: list[str]) -> set[str]:
    """Patients aren't branch-owned (the same patient can visit several
    branches) — so branch-scoped staff see whoever has an appointment or a
    conversation tied to one of their branches, not a hard per-record owner."""
    if not branch_ids:
        return set()

    appt_ids = {
        r["patient_id"]
        for r in db.table("appointments").select("patient_id").in_("branch_id", branch_ids).execute().data
    }

    channel_ids = [r["id"] for r in db.table("channels").select("id").in_("branch_id", branch_ids).execute().data]
    conv_ids: set[str] = set()
    if channel_ids:
        conv_ids = {
            r["patient_id"]
            for r in db.table("conversations")
            .select("patient_id")
            .in_("channel_id", channel_ids)
            .execute()
            .data
            if r["patient_id"]
        }

    return appt_ids | conv_ids


@router.get("/patients", response_model=list[Patient])
def list_patients(
    phone: str | None = None, current: CurrentStaff = Depends(require_permission("patient.view")), db: Client = Depends(get_supabase)
):
    query = db.table("patients").select("*").is_("is_merged_into", "null").is_("deleted_at", "null")
    if phone:
        # A patient may be visiting this branch for the very first time —
        # exact-phone lookup stays open regardless of branch scope so staff
        # can find (or confirm the absence of) an existing record before booking.
        # Still excludes merged-away tombstones — booking should always land
        # on the surviving record.
        query = query.eq("phone", phone)
        return query.execute().data

    allowed = allowed_branch_ids(current, "patient.view")
    if allowed is not None:
        visible_ids = _patient_ids_visible_in_branches(db, allowed)
        if not visible_ids:
            return []
        query = query.in_("id", list(visible_ids))
    return query.execute().data


@router.post("/patients", response_model=PatientCreateResult)
def create_patient(
    payload: PatientCreate, _current: CurrentStaff = Depends(require_permission("patient.create")), db: Client = Depends(get_supabase)
):
    if is_minor(payload.date_of_birth) and not payload.guardian:
        raise HTTPException(status_code=400, detail="المريض قاصر — يجب إدخال بيانات ولي الأمر (BR-011)")

    data = payload.model_dump(mode="json", exclude={"guardian"})
    patient = db.table("patients").insert(data).execute().data[0]

    if payload.guardian:
        guardian = db.table("guardians").insert(payload.guardian.model_dump(mode="json")).execute().data[0]
        db.table("patient_guardians").insert(
            {"patient_id": patient["id"], "guardian_id": guardian["id"], "is_primary": True}
        ).execute()

    duplicates = find_duplicates_for(db, patient)
    return PatientCreateResult(patient=Patient(**patient), potential_duplicates=[PatientDuplicate(**d) for d in duplicates])


@router.get("/patients/{patient_id}", response_model=Patient)
def get_patient(
    patient_id: UUID, _current: CurrentStaff = Depends(require_permission("patient.view")), db: Client = Depends(get_supabase)
):
    return db.table("patients").select("*").eq("id", str(patient_id)).is_("deleted_at", "null").single().execute().data


@router.patch("/patients/{patient_id}", response_model=Patient)
def update_patient(
    patient_id: UUID,
    payload: PatientUpdate,
    _current: CurrentStaff = Depends(require_permission("patient.update")),
    db: Client = Depends(get_supabase),
):
    updates = payload.model_dump(exclude_unset=True, mode="json")
    return db.table("patients").update(updates).eq("id", str(patient_id)).execute().data[0]


@router.get("/patients/{patient_id}/guardians", response_model=list[PatientGuardianLink])
def list_patient_guardians(
    patient_id: UUID, _current: CurrentStaff = Depends(require_permission("patient.view")), db: Client = Depends(get_supabase)
):
    rows = (
        db.table("patient_guardians")
        .select("*, guardians(full_name, phone)")
        .eq("patient_id", str(patient_id))
        .execute()
        .data
    )
    result = []
    for row in rows:
        guardian = row.pop("guardians", None) or {}
        row["guardian_full_name"] = guardian.get("full_name")
        row["guardian_phone"] = guardian.get("phone")
        result.append(row)
    return result


@router.post("/patients/{patient_id}/guardians", response_model=PatientGuardianLink)
def attach_guardian(
    patient_id: UUID,
    payload: PatientGuardianAttach,
    _current: CurrentStaff = Depends(require_permission("patient.update")),
    db: Client = Depends(get_supabase),
):
    if payload.guardian_id:
        guardian_id = str(payload.guardian_id)
    elif payload.guardian:
        guardian_id = db.table("guardians").insert(payload.guardian.model_dump(mode="json")).execute().data[0]["id"]
    else:
        raise HTTPException(status_code=400, detail="أدخل guardian_id أو بيانات ولي أمر جديد")

    link = (
        db.table("patient_guardians")
        .insert(
            {
                "patient_id": str(patient_id),
                "guardian_id": guardian_id,
                "relationship": payload.relationship,
                "is_primary": payload.is_primary,
            }
        )
        .execute()
        .data[0]
    )
    guardian = db.table("guardians").select("full_name, phone").eq("id", guardian_id).limit(1).execute().data[0]
    link["guardian_full_name"] = guardian["full_name"]
    link["guardian_phone"] = guardian["phone"]
    return link


@router.get("/patients/{patient_id}/tags", response_model=list[PatientTag])
def list_patient_tags(
    patient_id: UUID, _current: CurrentStaff = Depends(require_permission("patient.view")), db: Client = Depends(get_supabase)
):
    return db.table("patient_tags").select("*").eq("patient_id", str(patient_id)).execute().data


@router.post("/patients/{patient_id}/tags", response_model=PatientTag)
def add_patient_tag(
    patient_id: UUID,
    payload: PatientTagRequest,
    current: CurrentStaff = Depends(require_permission("patient.tag")),
    db: Client = Depends(get_supabase),
):
    return (
        db.table("patient_tags")
        .upsert({"patient_id": str(patient_id), "tag": payload.tag, "tagged_by": current.id})
        .execute()
        .data[0]
    )


@router.delete("/patients/{patient_id}/tags/{tag}")
def remove_patient_tag(
    patient_id: UUID,
    tag: str,
    _current: CurrentStaff = Depends(require_permission("patient.tag")),
    db: Client = Depends(get_supabase),
):
    db.table("patient_tags").delete().eq("patient_id", str(patient_id)).eq("tag", tag).execute()
    return {"removed": True}


@router.get("/patient-duplicates", response_model=list[PatientDuplicate])
def list_patient_duplicates(
    status: str = "pending",
    _current: CurrentStaff = Depends(require_permission("patient.view")),
    db: Client = Depends(get_supabase),
):
    rows = (
        db.table("patient_duplicates")
        .select("*, patient_a:patients!patient_duplicates_patient_a_id_fkey(full_name, phone), patient_b:patients!patient_duplicates_patient_b_id_fkey(full_name, phone)")
        .eq("status", status)
        .order("match_score", desc=True)
        .execute()
        .data
    )
    result = []
    for row in rows:
        a = row.pop("patient_a", None) or {}
        b = row.pop("patient_b", None) or {}
        row["patient_a_name"] = a.get("full_name")
        row["patient_a_phone"] = a.get("phone")
        row["patient_b_name"] = b.get("full_name")
        row["patient_b_phone"] = b.get("phone")
        result.append(row)
    return result


@router.post("/patient-duplicates/{duplicate_id}/merge", response_model=Patient)
def merge_duplicate(
    duplicate_id: UUID,
    payload: MergePatientsRequest,
    current: CurrentStaff = Depends(require_permission("patient.merge")),
    db: Client = Depends(get_supabase),
):
    return merge_patients(db, str(duplicate_id), str(payload.survivor_id), current.id)


@router.post("/patient-duplicates/{duplicate_id}/dismiss", response_model=PatientDuplicate)
def dismiss_patient_duplicate(
    duplicate_id: UUID,
    current: CurrentStaff = Depends(require_permission("patient.merge")),
    db: Client = Depends(get_supabase),
):
    return dismiss_duplicate(db, str(duplicate_id), current.id)
