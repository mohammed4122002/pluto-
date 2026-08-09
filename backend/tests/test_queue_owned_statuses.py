"""The status dropdown must not be able to fake a check-in.

check_in_appointment does two things together: it moves the appointment to
checked_in/waiting *and* it creates the queue_tickets row that every queue
screen reads. PATCH /appointments/{id}/status only did the first half, so
setting 'waiting' by hand produced a patient who was waiting according to the
appointments table and did not exist according to reception -- which is exactly
what happened to a real patient in the live clinic.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.core.auth import CurrentStaff, get_current_staff  # noqa: E402
from app.core.database import get_supabase  # noqa: E402
from app.routers import appointments  # noqa: E402
from app.services.appointments import QUEUE_OWNED_STATUSES  # noqa: E402
from tests.fake_supabase import FakeSupabase  # noqa: E402

APPT = "11111111-1111-4111-8111-111111111111"
BRANCH = "66666666-6666-4666-8666-666666666666"
STAFF = "44444444-4444-4444-8444-444444444444"


def _db() -> FakeSupabase:
    return FakeSupabase(
        {
            "appointments": [
                {
                    "id": APPT,
                    "branch_id": BRANCH,
                    "status": "confirmed",
                    "patient_id": "77777777-7777-4777-8777-777777777777",
                    "staff_id": STAFF,
                    "scheduled_at": "2026-08-10T09:00:00+00:00",
                    "appointment_number": "A-1",
                    "no_show_flag": False,
                    "created_at": "2026-08-01T09:00:00+00:00",
                    "updated_at": "2026-08-01T09:00:00+00:00",
                }
            ],
            # Every transition the test asks for is permitted, so a rejection
            # can only come from the guard and never from the state machine.
            "status_transitions": [
                {"from_status": "confirmed", "to_status": s}
                for s in (*QUEUE_OWNED_STATUSES, "completed", "cancelled")
            ],
            "appointment_status_history": [],
            "notification_schedules": [],
            "conversations": [],
        }
    )


def _client() -> TestClient:
    app = FastAPI()
    app.include_router(appointments.router)
    app.dependency_overrides[get_supabase] = lambda: _db()
    app.dependency_overrides[get_current_staff] = lambda: CurrentStaff(
        id=STAFF,
        full_name="سارة",
        email="s@example.com",
        role="receptionist",
        permissions={"appointment.update": {BRANCH}},
    )
    return TestClient(app)


def test_every_queue_owned_status_is_refused():
    client = _client()
    for status in sorted(QUEUE_OWNED_STATUSES):
        res = client.patch(f"/appointments/{APPT}/status", json={"status": status})
        assert res.status_code == 409, f"{status} was allowed through"
        assert "تسجيل حضور" in res.json()["detail"]


def test_closing_an_appointment_by_hand_still_works():
    # 'completed' is not queue-owned: an appointment that never entered the
    # queue still has to be closable, which is how overdue rows get resolved.
    res = _client().patch(f"/appointments/{APPT}/status", json={"status": "completed"})
    assert res.status_code == 200
    assert res.json()["status"] == "completed"


def test_the_guard_runs_before_the_write():
    db = _db()
    app = FastAPI()
    app.include_router(appointments.router)
    app.dependency_overrides[get_supabase] = lambda: db
    app.dependency_overrides[get_current_staff] = lambda: CurrentStaff(
        id=STAFF, full_name="سارة", email="s@example.com", role="receptionist",
        permissions={"appointment.update": {BRANCH}},
    )
    TestClient(app).patch(f"/appointments/{APPT}/status", json={"status": "waiting"})
    assert db._tables["appointments"][0]["status"] == "confirmed"
    assert db._tables["appointment_status_history"] == []
