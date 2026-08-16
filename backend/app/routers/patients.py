from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from supabase import Client

from app.core.auth import CurrentStaff, allowed_branch_ids, require_permission
from app.core.database import get_supabase
from app.core.scoping import StaffScope, get_staff_scope
from app.models.schemas import (
    Guardian,
    MergePatientsRequest,
    Patient,
    PatientCreate,
    PatientListItem,
    PatientPage,
    PatientCreateResult,
    PatientDuplicate,
    PatientGuardianAttach,
    PatientGuardianLink,
    PatientTag,
    PatientTagRequest,
    PatientUpdate,
)
from app.services.patient_management import (
    delete_patient_permanently,
    dismiss_duplicate,
    find_duplicates_for,
    is_minor,
    merge_patients,
)

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


@router.get("/patients", response_model=PatientPage)
def list_patients(
    phone: str | None = None,
    search: str | None = None,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    current: CurrentStaff = Depends(require_permission("patient.view")),
    scope: StaffScope = Depends(get_staff_scope),
    db: Client = Depends(get_supabase),
):
    """A page of the patients this staff member may see.

    The scoping runs inside `patients_for_staff` (0057) rather than here. It
    used to work by loading every appointment and conversation for the caller's
    branches, reducing them to a set of ids in Python, and passing that set back
    as `id=in.(...)` — which travels in the URL, so a branch with a few hundred
    patients was on course to break its own receptionist's list. The database
    was always the right place to answer "which patients can this person see".
    """
    if phone:
        # Exact-phone lookup stays open across *branches*: a patient may be at
        # this branch for the first time, and staff have to be able to find (or
        # rule out) an existing record before booking a duplicate. Open across
        # branches is not open across doctors, so self-scope still applies.
        rows = (
            db.table("patients")
            .select("*")
            .eq("phone", phone)
            .is_("is_merged_into", "null")
            .is_("deleted_at", "null")
            .execute()
            .data
        )
        own = scope.narrow_patient_ids({r["id"] for r in rows})
        if own is not None:
            rows = [r for r in rows if r["id"] in own]
        return PatientPage(
            items=[PatientListItem(**r, tags=[]) for r in rows],
            total=len(rows),
            limit=limit,
            offset=offset,
        )

    allowed = allowed_branch_ids(current, "patient.view")
    rows = db.rpc(
        "patients_for_staff",
        {
            "p_staff_id": scope.staff_id,
            "p_branch_ids": allowed,
            "p_self_scoped": scope.is_self_scoped,
            "p_search": search,
            "p_limit": limit,
            "p_offset": offset,
        },
    ).execute().data

    total = rows[0]["total_count"] if rows else 0
    return PatientPage(
        items=[PatientListItem(**{k: v for k, v in r.items() if k != "total_count"}) for r in rows],
        total=total,
        limit=limit,
        offset=offset,
    )


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


@router.delete("/patients/{patient_id}")
def delete_patient(
    patient_id: UUID,
    current: CurrentStaff = Depends(require_permission("patient.delete")),
    db: Client = Depends(get_supabase),
):
    """Permanent, not the soft delete=hide-from-lists pattern used
    elsewhere — see delete_patient_permanently's docstring for why a QA
    reset needs the harder version. Restricted to patient.delete, which
    only clinic_manager/system_administrator hold by default (0006_rbac.sql)
    — the same bar as every other irreversible admin action in this API."""
    delete_patient_permanently(db, str(patient_id), current.id)
    return {"deleted": True}


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
