"""Doctor leave self-service, and the reception desk.

Leave: `doctor_leaves` fed the slot generator from the start but had no way in,
so it could only be written by hand. What matters is that filing leave closes
the booking window and that cancelling it reopens *only* what it closed.

Desk: the front-desk view is branch-scoped, not self-scoped — the opposite of
every /me endpoint — so it gets its own cover.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from datetime import datetime, timedelta, timezone  # noqa: E402

from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.core.auth import CurrentStaff, get_current_staff  # noqa: E402
from app.core.database import get_supabase  # noqa: E402
from app.routers import me, reception  # noqa: E402
from app.routers import staff as staff_router  # noqa: E402
from tests.fake_supabase import FakeSupabase  # noqa: E402

DOCTOR = "44444444-4444-4444-8444-444444444444"
OTHER = "55555555-5555-4555-8555-555555555555"
BRANCH = "66666666-6666-4666-8666-666666666666"
PATIENT = "77777777-7777-4777-8777-777777777777"
LEAVE = "99999999-9999-4999-8999-999999999999"
APPT_LIVE = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
APPT_CANCELLED = "cccccccc-cccc-4ccc-8ccc-cccccccccccc"
OTHER_LEAVE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"

# Anchored to a fixed hour, not "now + a day": the desk filters by UTC day, so
# a fixture built from the current clock silently pushed the later appointments
# into the next day whenever the suite ran in the evening.
TOMORROW = (datetime.now(timezone.utc) + timedelta(days=1)).replace(
    hour=6, minute=0, second=0, microsecond=0
)
DAY_AFTER = TOMORROW + timedelta(days=1)


def _db() -> FakeSupabase:
    return FakeSupabase(
        {
            "staff_branches": [{"staff_id": DOCTOR, "branch_id": BRANCH}],
            "doctor_leaves": [
                {"id": LEAVE, "staff_id": DOCTOR, "start_at": TOMORROW.isoformat(),
                 "end_at": DAY_AFTER.isoformat(), "reason": "سفر", "leave_type": "planned",
                 "created_at": TOMORROW.isoformat()},
                {"id": OTHER_LEAVE, "staff_id": OTHER, "start_at": TOMORROW.isoformat(),
                 "end_at": DAY_AFTER.isoformat(), "reason": None, "leave_type": "planned",
                 "created_at": TOMORROW.isoformat()},
            ],
            "slots": [
                {"id": "dddddddd-dddd-4ddd-8ddd-dddddddddddd", "doctor_id": DOCTOR, "branch_id": BRANCH, "status": "available",
                 "start_at": (TOMORROW + timedelta(hours=1)).isoformat(), "block_reason": None},
                {"id": "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee", "doctor_id": DOCTOR, "branch_id": BRANCH, "status": "booked",
                 "start_at": (TOMORROW + timedelta(hours=2)).isoformat(), "block_reason": None},
                {"id": "ffffffff-ffff-4fff-8fff-ffffffffffff", "doctor_id": DOCTOR, "branch_id": BRANCH, "status": "blocked",
                 "start_at": (TOMORROW + timedelta(hours=3)).isoformat(), "block_reason": "maintenance"},
            ],
            "appointments": [
                {"id": "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", "staff_id": DOCTOR, "branch_id": BRANCH, "patient_id": PATIENT,
                 "scheduled_at": (TOMORROW + timedelta(hours=2)).isoformat(), "duration_minutes": 30,
                 "status": "confirmed", "service_id": None, "confirmation_code": "AB12", "deleted_at": None},
                {"id": "cccccccc-cccc-4ccc-8ccc-cccccccccccc", "staff_id": DOCTOR, "branch_id": BRANCH, "patient_id": PATIENT,
                 "scheduled_at": (TOMORROW + timedelta(hours=4)).isoformat(), "duration_minutes": 30,
                 "status": "cancelled", "service_id": None, "confirmation_code": None, "deleted_at": None},
            ],
            "patients": [{"id": PATIENT, "full_name": "محمد سعادة", "phone": "+962795550001"}],
            "staff": [{"id": DOCTOR, "full_name": "د. سارة الخطيب", "role": "doctor",
                       "is_active": True, "deleted_at": None}],
            "services": [],
            "queues": [],
            "queue_tickets": [],
            "channels": [],
            "conversations": [],
            "branches": [{"id": BRANCH, "name": "فرع عبدون", "is_active": True}],
        }
    )


def _client(router, permissions: dict[str, set], role: str = "doctor", db: FakeSupabase | None = None):
    shared = db or _db()
    app = FastAPI()
    app.include_router(router)
    app.dependency_overrides[get_supabase] = lambda: shared
    app.dependency_overrides[get_current_staff] = lambda: CurrentStaff(
        id=DOCTOR, full_name="د. سارة", email="s@example.com", role=role, permissions=permissions
    )
    return TestClient(app), shared


# --- leave -------------------------------------------------------------------


def test_my_leaves_lists_only_mine():
    client, _ = _client(me.router, {})
    body = client.get("/me/leaves").json()
    assert [leave["id"] for leave in body] == [LEAVE]


def test_filing_leave_blocks_free_slots_only():
    client, db = _client(me.router, {})
    res = client.post(
        "/me/leaves",
        json={"start_at": TOMORROW.isoformat(), "end_at": DAY_AFTER.isoformat(), "leave_type": "planned"},
    )
    assert res.status_code == 200
    # The available slot closes; a booked one belongs to a patient and a slot
    # blocked for another reason isn't this leave's to touch.
    assert res.json()["slots_blocked"] == 1


def test_filing_leave_surfaces_appointments_that_still_need_a_human():
    client, _ = _client(me.router, {})
    res = client.post(
        "/me/leaves",
        json={"start_at": TOMORROW.isoformat(), "end_at": DAY_AFTER.isoformat(), "leave_type": "planned"},
    )
    conflicts = res.json()["conflicts"]
    assert [c["id"] for c in conflicts] == [APPT_LIVE]
    assert conflicts[0]["patient_name"] == "محمد سعادة"


def test_leave_in_the_past_is_refused():
    client, _ = _client(me.router, {})
    past = datetime.now(timezone.utc) - timedelta(days=3)
    res = client.post(
        "/me/leaves",
        json={"start_at": past.isoformat(), "end_at": (past + timedelta(days=1)).isoformat()},
    )
    assert res.status_code == 400


def test_leave_ending_before_it_starts_is_refused():
    client, _ = _client(me.router, {})
    res = client.post(
        "/me/leaves",
        json={"start_at": DAY_AFTER.isoformat(), "end_at": TOMORROW.isoformat()},
    )
    assert res.status_code == 400


def test_cannot_cancel_someone_elses_leave():
    client, _ = _client(me.router, {})
    assert client.delete(f"/me/leaves/{OTHER_LEAVE}").status_code == 403


# --- reception desk ----------------------------------------------------------

DESK_PERMISSIONS = {"appointment.view": {BRANCH}, "conversation.view": {BRANCH}}


def test_desk_falls_back_to_the_staff_members_own_branch():
    """A receptionist works at one desk; they shouldn't have to pick it."""
    client, _ = _client(reception.router, DESK_PERMISSIONS, role="receptionist")
    body = client.get("/reception/desk", params={"date": TOMORROW.date().isoformat()}).json()
    assert body["branch_id"] == BRANCH


def test_desk_lists_arrivals_with_names_resolved():
    client, _ = _client(reception.router, DESK_PERMISSIONS, role="receptionist")
    body = client.get("/reception/desk", params={"date": TOMORROW.date().isoformat()}).json()
    arrivals = {a["appointment_id"]: a for a in body["arrivals"]}
    assert arrivals[APPT_LIVE]["patient_name"] == "محمد سعادة"
    assert arrivals[APPT_LIVE]["doctor_name"] == "د. سارة الخطيب"
    assert arrivals[APPT_LIVE]["checked_in"] is False


def test_desk_counts_exclude_settled_appointments():
    client, _ = _client(reception.router, DESK_PERMISSIONS, role="receptionist")
    body = client.get("/reception/desk", params={"date": TOMORROW.date().isoformat()}).json()
    # Two appointments that day, one already cancelled.
    assert len(body["arrivals"]) == 2
    assert body["expected_count"] == 1


def test_desk_refuses_a_branch_the_caller_has_no_access_to():
    client, _ = _client(reception.router, DESK_PERMISSIONS, role="receptionist")
    res = client.get("/reception/desk", params={"branch_id": "11111111-1111-4111-8111-111111111111"})
    assert res.status_code == 403


def test_desk_requires_appointment_view():
    client, _ = _client(reception.router, {}, role="receptionist")
    assert client.get("/reception/desk").status_code == 403


# --- staff directory ---------------------------------------------------------
#
# Booking screens need the doctor list; only the personnel file needs
# staff.view. Reception holds none of it, so calling GET /staff from a booking
# screen 403'd the whole page -- the queue, the calendar and the appointments
# table all went blank for the role that uses them most.


def test_directory_works_without_staff_view():
    client, _ = _client(staff_router.router, {"appointment.view": {BRANCH}}, role="receptionist")
    res = client.get("/staff/directory")
    assert res.status_code == 200
    assert [s["full_name"] for s in res.json()] == ["د. سارة الخطيب"]


def test_directory_exposes_names_and_nothing_else():
    """The response model is the enforcement: anything that makes a staff row
    sensitive stays behind staff.view on GET /staff."""
    client, _ = _client(staff_router.router, {}, role="receptionist")
    entry = client.get("/staff/directory").json()[0]
    assert set(entry) == {"id", "full_name", "role", "is_active"}


def test_full_staff_list_still_needs_staff_view():
    client, _ = _client(staff_router.router, {"appointment.view": {BRANCH}}, role="receptionist")
    assert client.get("/staff").status_code == 403
