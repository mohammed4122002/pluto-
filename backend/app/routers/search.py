"""One box, several tables. Patients, appointments, and staff each already had
their own in-page filter — this is the fast path for "I don't know which page
this is on", federated across whichever of those the caller can actually see.

Same scope rules as everywhere else: branch grants narrow patients/appointments/
staff to the caller's branches, and a self-scoped role (see app/core/scoping.py)
narrows patients/appointments to their own regardless of branch, and never sees
staff results at all (they hold no staff.view grant to begin with).
"""

from fastapi import APIRouter, Depends
from supabase import Client

from app.core.auth import CurrentStaff, allowed_branch_ids, get_current_staff
from app.core.database import get_supabase
from app.core.scoping import StaffScope, get_staff_scope
from app.models.schemas import SearchAppointmentResult, SearchPatientResult, SearchResults, SearchStaffResult

router = APIRouter(tags=["search"])

_MAX_RESULTS = 6
_MIN_QUERY_LEN = 2


def _matches(term: str, *values: str | None) -> bool:
    return any(v and term in v.lower() for v in values)


def _name_map(db: Client, ids: set[str]) -> dict[str, str]:
    ids = {i for i in ids if i}
    if not ids:
        return {}
    rows = db.table("patients").select("id, full_name").in_("id", list(ids)).execute().data
    return {r["id"]: r["full_name"] for r in rows}


def _search_patients(db: Client, current: CurrentStaff, scope: StaffScope, term: str) -> list[SearchPatientResult]:
    if not current.has_permission("patient.view"):
        return []

    query = db.table("patients").select("id, full_name, phone").is_("is_merged_into", "null").is_("deleted_at", "null")

    allowed = allowed_branch_ids(current, "patient.view")
    visible_ids: set[str] | None = None
    if allowed is not None:
        if not allowed:
            visible_ids = set()
        else:
            appt_ids = {
                r["patient_id"]
                for r in db.table("appointments").select("patient_id").in_("branch_id", allowed).execute().data
            }
            channel_ids = [r["id"] for r in db.table("channels").select("id").in_("branch_id", allowed).execute().data]
            conv_ids: set[str] = set()
            if channel_ids:
                conv_ids = {
                    r["patient_id"]
                    for r in db.table("conversations").select("patient_id").in_("channel_id", channel_ids).execute().data
                    if r["patient_id"]
                }
            visible_ids = appt_ids | conv_ids
    visible_ids = scope.narrow_patient_ids(visible_ids)

    if visible_ids is not None and not visible_ids:
        return []
    rows = (query.in_("id", list(visible_ids)) if visible_ids is not None else query).execute().data
    matched = [r for r in rows if _matches(term, r["full_name"], r.get("phone"))]
    return [SearchPatientResult(id=r["id"], full_name=r["full_name"], phone=r.get("phone")) for r in matched[:_MAX_RESULTS]]


def _search_appointments(
    db: Client, current: CurrentStaff, scope: StaffScope, term: str
) -> list[SearchAppointmentResult]:
    if not current.has_permission("appointment.view"):
        return []

    query = (
        db.table("appointments")
        .select("id, scheduled_at, status, patient_id, confirmation_code, appointment_number")
        .is_("deleted_at", "null")
    )
    if scope.is_self_scoped:
        query = query.eq("staff_id", scope.staff_id)
    else:
        allowed = allowed_branch_ids(current, "appointment.view")
        if allowed is not None:
            if not allowed:
                return []
            query = query.in_("branch_id", allowed)

    rows = query.execute().data
    names = _name_map(db, {r["patient_id"] for r in rows if r.get("patient_id")})
    matched = [
        r
        for r in rows
        if _matches(term, r.get("confirmation_code"), r.get("appointment_number"), names.get(r["patient_id"]))
    ]
    matched.sort(key=lambda r: r["scheduled_at"], reverse=True)
    return [
        SearchAppointmentResult(
            id=r["id"], scheduled_at=r["scheduled_at"], status=r["status"], patient_name=names.get(r["patient_id"], "—")
        )
        for r in matched[:_MAX_RESULTS]
    ]


def _search_staff(db: Client, current: CurrentStaff, scope: StaffScope, term: str) -> list[SearchStaffResult]:
    # A self-scoped role holds no staff.view grant of its own -- this check
    # is redundant with has_permission below in practice, but kept explicit
    # since "search" is exactly the kind of new entry point that would
    # otherwise skip a scope rule enforced everywhere else.
    if scope.is_self_scoped or not current.has_permission("staff.view"):
        return []

    rows = db.table("staff").select("id, full_name, email, role").is_("deleted_at", "null").execute().data
    allowed = allowed_branch_ids(current, "staff.view")
    if allowed is not None:
        if not allowed:
            return []
        branch_staff_ids = {
            r["staff_id"] for r in db.table("staff_branches").select("staff_id").in_("branch_id", allowed).execute().data
        }
        rows = [r for r in rows if r["id"] in branch_staff_ids]

    matched = [r for r in rows if _matches(term, r["full_name"], r.get("email"))]
    return [SearchStaffResult(id=r["id"], full_name=r["full_name"], role=r["role"]) for r in matched[:_MAX_RESULTS]]


@router.get("/search", response_model=SearchResults)
def search(
    q: str,
    current: CurrentStaff = Depends(get_current_staff),
    scope: StaffScope = Depends(get_staff_scope),
    db: Client = Depends(get_supabase),
):
    term = q.strip().lower()
    if len(term) < _MIN_QUERY_LEN:
        return SearchResults()
    return SearchResults(
        patients=_search_patients(db, current, scope, term),
        appointments=_search_appointments(db, current, scope, term),
        staff=_search_staff(db, current, scope, term),
    )
