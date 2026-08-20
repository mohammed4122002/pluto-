"""The /me workspace, exercised through the real router.

Two properties matter here and are easy to lose in a refactor:
1. everything comes back scoped to the caller, never to a client-supplied id;
2. nothing requires a grant the caller doesn't have — that is the whole reason
   these endpoints exist instead of the admin ones.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.core.auth import CurrentStaff, get_current_staff  # noqa: E402
from app.core.database import get_supabase  # noqa: E402
from app.routers import me  # noqa: E402
from tests.fake_supabase import FakeSupabase  # noqa: E402

DOCTOR = "44444444-4444-4444-8444-444444444444"
OTHER = "55555555-5555-4555-8555-555555555555"
BRANCH = "66666666-6666-4666-8666-666666666666"
PATIENT = "77777777-7777-4777-8777-777777777777"
OTHER_PATIENT = "88888888-8888-4888-8888-888888888888"
SERVICE = "99999999-9999-4999-8999-999999999999"
APPOINTMENT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
QUEUE = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
OTHER_TICKET = "ffffffff-ffff-4fff-8fff-ffffffffffff"
TICKET = "cccccccc-cccc-4ccc-8ccc-cccccccccccc"

# The doctor role's real grant — deliberately without branch.view or staff.view,
# the two that broke the admin screens.
DOCTOR_PERMISSIONS = {
    "queue.view": {BRANCH},
    "slot.view": {BRANCH},
    "appointment.view": {BRANCH},
    "patient.view": {BRANCH},
    "service.view": {BRANCH},
}


def _db() -> FakeSupabase:
    return FakeSupabase(
        {
            "staff_branches": [{"staff_id": DOCTOR, "branch_id": BRANCH}],
            "branches": [{"id": BRANCH, "name": "الفرع الرئيسي", "is_active": True, "timezone": "Asia/Amman"}],
            "queues": [
                {"id": QUEUE, "branch_id": BRANCH, "doctor_id": DOCTOR, "queue_date": "2026-08-06", "is_active": True},
                {"id": "q-other", "branch_id": BRANCH, "doctor_id": OTHER, "queue_date": "2026-08-06", "is_active": True},
            ],
            "queue_tickets": [
                {
                    "id": TICKET, "queue_id": QUEUE, "appointment_id": APPOINTMENT, "patient_id": PATIENT,
                    "ticket_number": 1, "priority_level": "normal", "status": "waiting", "arrival_status": None,
                    "checked_in_at": "2026-08-06T08:30:00+00:00", "called_at": None, "started_at": None,
                    "ended_at": None, "estimated_entry_time": None, "queues": {"doctor_id": DOCTOR},
                },
                {
                    "id": OTHER_TICKET, "queue_id": "q-other", "appointment_id": APPOINTMENT,
                    "patient_id": OTHER_PATIENT, "ticket_number": 1, "priority_level": "normal",
                    "status": "waiting", "arrival_status": None, "checked_in_at": "2026-08-06T08:00:00+00:00",
                    "called_at": None, "started_at": None, "ended_at": None, "estimated_entry_time": None,
                    "queues": {"doctor_id": OTHER},
                },
            ],
            "patients": [
                {"id": PATIENT, "full_name": "مريم", "phone": "+962700000001", "email": None,
                 "date_of_birth": None, "gender": None, "notes": None, "is_merged_into": None, "deleted_at": None},
                {"id": OTHER_PATIENT, "full_name": "مريض غيري", "phone": "+962700000002", "email": None,
                 "date_of_birth": None, "gender": None, "notes": None, "is_merged_into": None, "deleted_at": None},
            ],
            "appointments": [
                {"id": APPOINTMENT, "patient_id": PATIENT, "staff_id": DOCTOR, "branch_id": BRANCH,
                 "service_id": SERVICE, "scheduled_at": "2026-08-06T09:00:00+00:00", "duration_minutes": 30,
                 "status": "confirmed", "reason_for_visit": None, "queue_number": None, "check_in_time": None,
                 "slot_id": None, "deleted_at": None},
                {"id": "a-other", "patient_id": OTHER_PATIENT, "staff_id": OTHER, "branch_id": BRANCH,
                 "service_id": SERVICE, "scheduled_at": "2026-08-06T10:00:00+00:00", "duration_minutes": 30,
                 "status": "confirmed", "reason_for_visit": None, "queue_number": None, "check_in_time": None,
                 "slot_id": None, "deleted_at": None},
            ],
            "slots": [
                {"id": "dddddddd-dddd-4ddd-8ddd-dddddddddddd", "branch_id": BRANCH, "doctor_id": DOCTOR,
                 "service_id": SERVICE, "start_at": "2026-08-06T11:00:00+00:00",
                 "end_at": "2026-08-06T11:30:00+00:00", "duration_minutes": 30, "status": "available"},
                {"id": "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee", "branch_id": BRANCH, "doctor_id": OTHER,
                 "service_id": SERVICE, "start_at": "2026-08-06T12:00:00+00:00",
                 "end_at": "2026-08-06T12:30:00+00:00", "duration_minutes": 30, "status": "available"},
            ],
            "services": [
                {"id": SERVICE, "name": "استشارة", "description": None, "duration_minutes": 30,
                 "price": 25.0, "is_active": True, "specialty_id": None, "deleted_at": None},
            ],
            "service_doctors": [{"service_id": SERVICE, "staff_id": DOCTOR}],
            "specialties": [],
            "patient_tags": [{"patient_id": PATIENT, "tag": "vip"}],
        }
    )


def _client(permissions: dict[str, set] | None = None, role: str = "doctor") -> TestClient:
    app = FastAPI()
    app.include_router(me.router)
    app.dependency_overrides[get_supabase] = lambda: _db()
    app.dependency_overrides[get_current_staff] = lambda: CurrentStaff(
        id=DOCTOR,
        full_name="د. سارة",
        email="s@example.com",
        role=role,
        permissions=DOCTOR_PERMISSIONS if permissions is None else permissions,
    )
    return TestClient(app)


def test_branches_needs_no_branch_view_grant():
    """The regression that broke every doctor screen: these used to open with
    /branches, which a doctor may not call."""
    res = _client().get("/me/branches")
    assert res.status_code == 200
    assert [b["name"] for b in res.json()] == ["الفرع الرئيسي"]


def test_queue_returns_only_my_tickets_with_patients_resolved():
    res = _client().get("/me/queue", params={"date": "2026-08-06"})
    assert res.status_code == 200
    body = res.json()
    tickets = [t for q in body["queues"] for t in q["tickets"]]
    assert [t["id"] for t in tickets] == [TICKET]
    # Resolved server-side — the screen never calls /patients to get this.
    assert tickets[0]["patient_name"] == "مريم"
    assert body["queues"][0]["branch_name"] == "الفرع الرئيسي"
    # A confirmed time is real-world at that branch, not whatever timezone
    # the browser reviewing it happens to be in -- confirmed live, a booking
    # correctly stored as 13:00 Asia/Amman rendered as 12:00 on the
    # appointments table for a browser one zone off from the branch.
    assert body["queues"][0]["branch_timezone"] == "Asia/Amman"
    assert body["waiting_count"] == 1


def test_calendar_returns_only_my_slots_and_appointments():
    res = _client().get("/me/calendar", params={"date": "2026-08-06"})
    assert res.status_code == 200
    body = res.json()
    assert [a["patient_name"] for a in body["appointments"]] == ["مريم"]
    assert [s["id"] for s in body["slots"]] == ["dddddddd-dddd-4ddd-8ddd-dddddddddddd"]
    assert body["appointments"][0]["service_name"] == "استشارة"
    assert body["appointments"][0]["branch_timezone"] == "Asia/Amman"
    assert body["slots"][0]["branch_timezone"] == "Asia/Amman"


def test_branch_timezone_falls_back_when_a_branch_row_has_none_set():
    # _name_map used r[column], which raised KeyError the moment a selected
    # column wasn't present on a row -- real Supabase always sends it (null
    # if unset), but this must degrade the same way rather than 500 if a row
    # is ever missing it, the same way branch_name's own "—" fallback does.
    db = _db()
    db._tables["branches"][0].pop("timezone", None)
    app = FastAPI()
    app.include_router(me.router)
    app.dependency_overrides[get_supabase] = lambda: db
    app.dependency_overrides[get_current_staff] = lambda: CurrentStaff(
        id=DOCTOR, full_name="د. سارة", email="s@example.com", role="doctor", permissions=DOCTOR_PERMISSIONS
    )
    res = TestClient(app).get("/me/queue", params={"date": "2026-08-06"})
    assert res.status_code == 200
    assert res.json()["queues"][0]["branch_timezone"] == "Asia/Amman"


def test_calendar_omits_appointments_without_appointment_view():
    permissions = {k: v for k, v in DOCTOR_PERMISSIONS.items() if k != "appointment.view"}
    body = _client(permissions).get("/me/calendar", params={"date": "2026-08-06"}).json()
    assert body["appointments"] == []
    assert len(body["slots"]) == 1


def test_services_returns_only_mine():
    res = _client().get("/me/services")
    assert res.status_code == 200
    assert [s["name"] for s in res.json()] == ["استشارة"]


def test_patients_returns_only_mine_with_my_own_history():
    res = _client().get("/me/patients")
    assert res.status_code == 200
    body = res.json()
    assert [p["full_name"] for p in body] == ["مريم"]
    assert body[0]["tags"] == ["vip"]


def test_ticket_action_rejects_another_doctors_ticket():
    assert _client().post(f"/me/queue/tickets/{OTHER_TICKET}/start").status_code == 403


def test_each_endpoint_still_requires_its_view_permission():
    client = _client({})
    for path in ("/me/queue", "/me/calendar", "/me/services", "/me/patients"):
        assert client.get(path).status_code == 403, path
