"""/search's appointment results carry branch_id, so the dashboard's global
search can show a result's scheduled_at in that branch's own timezone
instead of the browser's -- see format.ts's TimeZoneOpt comment for the live
incident (a booking correctly stored as 13:00 Asia/Amman rendered as 12:00
for a browser one zone off from the branch) that this closes for search
results the same way it was closed for the appointments table itself.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.core.auth import CurrentStaff, get_current_staff  # noqa: E402
from app.core.database import get_supabase  # noqa: E402
from app.core.scoping import StaffScope, get_staff_scope  # noqa: E402
from app.routers import search  # noqa: E402
from tests.fake_supabase import FakeSupabase  # noqa: E402

BRANCH = "66666666-6666-4666-8666-666666666666"
PATIENT = "77777777-7777-4777-8777-777777777777"
APPOINTMENT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"

ADMIN_PERMISSIONS = {"patient.view": {None}, "appointment.view": {None}, "staff.view": {None}}


def _db() -> FakeSupabase:
    return FakeSupabase(
        {
            "appointments": [
                {
                    "id": APPOINTMENT,
                    "scheduled_at": "2026-08-20T10:00:00+00:00",
                    "status": "confirmed",
                    "patient_id": PATIENT,
                    "branch_id": BRANCH,
                    "confirmation_code": "APT-XYZ",
                    "appointment_number": "APT-20260820-XYZ",
                    "deleted_at": None,
                }
            ],
            "patients": [{"id": PATIENT, "full_name": "محمد سعادة"}],
            "staff": [],
        }
    )


def _client(db: FakeSupabase) -> TestClient:
    app = FastAPI()
    app.include_router(search.router)
    current = CurrentStaff(
        id="admin-1", full_name="مدير", email="a@example.com", role="admin", permissions=ADMIN_PERMISSIONS
    )
    app.dependency_overrides[get_supabase] = lambda: db
    app.dependency_overrides[get_current_staff] = lambda: current
    app.dependency_overrides[get_staff_scope] = lambda: StaffScope(db, current)
    return TestClient(app)


def test_appointment_search_results_carry_their_branch_id():
    res = _client(_db()).get("/search", params={"q": "محمد"})
    assert res.status_code == 200
    appointments = res.json()["appointments"]
    assert len(appointments) == 1
    assert appointments[0]["branch_id"] == BRANCH
