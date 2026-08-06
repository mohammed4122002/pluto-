"""Regression tests for staff data scoping.

The bug these exist to prevent: the "doctors see only their own patients"
filter used to live *inside* the branch-scope branch, so a doctor holding a
clinic-wide grant — which is exactly what staff creation handed out when
nobody picked a branch — skipped it entirely and could read every patient in
the clinic. Both halves of that failure are covered here: the filter itself,
and the grant that made it reachable.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.auth import CurrentStaff  # noqa: E402
from app.core.rbac import sync_legacy_role  # noqa: E402
from app.core.scoping import StaffScope  # noqa: E402
from tests.fake_supabase import FakeSupabase  # noqa: E402

DOCTOR_ID = "doc-1"
OTHER_DOCTOR_ID = "doc-2"


def _staff(role: str, permissions: dict[str, set] | None = None) -> CurrentStaff:
    return CurrentStaff(
        id=DOCTOR_ID,
        full_name="د. سارة",
        email="s@example.com",
        role=role,
        permissions=permissions if permissions is not None else {"patient.view": {None}},
    )


def _db_with_appointments() -> FakeSupabase:
    return FakeSupabase(
        {
            "appointments": [
                {"patient_id": "p1", "staff_id": DOCTOR_ID, "branch_id": "b1", "deleted_at": None},
                {"patient_id": "p2", "staff_id": DOCTOR_ID, "branch_id": "b1", "deleted_at": None},
                {"patient_id": "p3", "staff_id": OTHER_DOCTOR_ID, "branch_id": "b1", "deleted_at": None},
            ],
            "staff_branches": [{"staff_id": DOCTOR_ID, "branch_id": "b1"}],
        }
    )


def test_clinic_wide_grant_still_narrows_a_doctor_to_their_own_patients():
    """The exact regression: no branch restriction (`None`) must not mean
    "no restriction at all" for a self-scoped role."""
    scope = StaffScope(_db_with_appointments(), _staff("doctor"))
    assert scope.narrow_patient_ids(None) == {"p1", "p2"}


def test_branch_restriction_and_self_scope_intersect():
    scope = StaffScope(_db_with_appointments(), _staff("doctor"))
    # The branch says p1/p2/p3 are visible; ownership says only p1/p2 are his.
    assert scope.narrow_patient_ids({"p1", "p2", "p3"}) == {"p1", "p2"}


def test_receptionist_is_not_narrowed_to_own_patients():
    scope = StaffScope(_db_with_appointments(), _staff("receptionist"))
    assert scope.narrow_patient_ids(None) is None
    assert scope.narrow_patient_ids({"p1", "p3"}) == {"p1", "p3"}


def test_doctor_with_no_appointments_sees_nobody():
    db = FakeSupabase({"appointments": [], "staff_branches": []})
    scope = StaffScope(db, _staff("doctor"))
    assert scope.narrow_patient_ids(None) == set()


def test_branch_ids_fall_back_to_own_records_when_unassigned():
    """Staff predating mandatory branch assignment still get a usable
    workspace instead of an empty branch picker."""
    db = FakeSupabase(
        {
            "staff_branches": [],
            "appointments": [{"staff_id": DOCTOR_ID, "branch_id": "b7", "deleted_at": None}],
            "slots": [{"doctor_id": DOCTOR_ID, "branch_id": "b9"}],
        }
    )
    assert StaffScope(db, _staff("doctor")).branch_ids() == ["b7", "b9"]


def test_ticket_ownership_gates_queue_actions():
    db = FakeSupabase(
        {
            "queue_tickets": [
                {"id": "t-mine", "queues": {"doctor_id": DOCTOR_ID}},
                {"id": "t-theirs", "queues": {"doctor_id": OTHER_DOCTOR_ID}},
            ]
        }
    )
    scope = StaffScope(db, _staff("doctor", {"queue.view": {None}}))
    assert scope.can_manage_own_ticket("t-mine")
    assert not scope.can_manage_own_ticket("t-theirs")


def test_queue_manage_permission_still_covers_anyone_elses_ticket():
    db = FakeSupabase({"queue_tickets": [{"id": "t-theirs", "queues": {"doctor_id": OTHER_DOCTOR_ID}}]})
    scope = StaffScope(db, _staff("receptionist", {"queue.manage": {None}}))
    assert scope.can_manage_own_ticket("t-theirs")


# --- the grant side of the same bug ------------------------------------------


def _rbac_db() -> FakeSupabase:
    return FakeSupabase({"roles": [{"id": "role-doctor", "code": "doctor"}], "user_roles": []})


def test_doctor_without_branches_gets_no_grant_rather_than_a_clinic_wide_one():
    db = _rbac_db()
    sync_legacy_role(db, DOCTOR_ID, "doctor", [])
    assert db.inserts.get("user_roles") is None


def test_doctor_with_branches_is_granted_per_branch():
    db = _rbac_db()
    sync_legacy_role(db, DOCTOR_ID, "doctor", ["b1", "b2"])
    assert [r["branch_id"] for r in db.inserts["user_roles"]] == ["b1", "b2"]


def test_system_administrator_is_still_clinic_wide():
    db = FakeSupabase({"roles": [{"id": "role-admin", "code": "system_administrator"}], "user_roles": []})
    sync_legacy_role(db, "admin-1", "admin", ["b1"])
    assert [r["branch_id"] for r in db.inserts["user_roles"]] == [None]
