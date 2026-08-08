"""Cover for the patient leak, through the real router.

The list scoping now lives in `patients_for_staff` (0057), not in Python — it
was reading whole tables to build a set of ids for an `in.(...)` URL filter,
which stops working around a few hundred patients. The SQL was checked against
the live database: for a doctor with a clinic-wide grant it returns 3 patients
where the clinic has 74, and `test_leaves_and_reception.py` pins the arguments
the router hands it.

What is still Python, and so still belongs here, is the phone lookup: it is
deliberately open across branches so staff can find an existing record before
creating a duplicate, and self-scope has to keep applying on top of that.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.core.auth import CurrentStaff, get_current_staff  # noqa: E402
from app.core.database import get_supabase  # noqa: E402
from app.routers import patients  # noqa: E402
from tests.fake_supabase import FakeSupabase  # noqa: E402

MINE_A = "11111111-1111-4111-8111-111111111111"
MINE_B = "22222222-2222-4222-8222-222222222222"
THEIRS = "33333333-3333-4333-8333-333333333333"
DOCTOR_ID = "44444444-4444-4444-8444-444444444444"
OTHER_DOCTOR_ID = "55555555-5555-4555-8555-555555555555"


def _patient(pid: str, name: str) -> dict:
    return {
        "id": pid,
        "full_name": name,
        "phone": f"+9627{pid[:7]}",
        "email": None,
        "date_of_birth": None,
        "gender": None,
        "notes": None,
        "is_merged_into": None,
        "deleted_at": None,
    }


def _client(role: str, permissions: dict[str, set]) -> TestClient:
    db = FakeSupabase(
        {
            "patients": [
                _patient(MINE_A, "مريض إلي أ"),
                _patient(MINE_B, "مريض إلي ب"),
                _patient(THEIRS, "مريض دكتور تاني"),
            ],
            "appointments": [
                {"patient_id": MINE_A, "staff_id": DOCTOR_ID, "branch_id": "b1", "deleted_at": None},
                {"patient_id": MINE_B, "staff_id": DOCTOR_ID, "branch_id": "b1", "deleted_at": None},
                {"patient_id": THEIRS, "staff_id": OTHER_DOCTOR_ID, "branch_id": "b1", "deleted_at": None},
            ],
            "staff_branches": [{"staff_id": DOCTOR_ID, "branch_id": "b1"}],
            "channels": [],
            "conversations": [],
        }
    )
    app = FastAPI()
    app.include_router(patients.router)
    app.dependency_overrides[get_supabase] = lambda: db
    app.dependency_overrides[get_current_staff] = lambda: CurrentStaff(
        id=DOCTOR_ID, full_name="د. سارة", email="s@example.com", role=role, permissions=permissions
    )
    return TestClient(app)


def test_doctor_cannot_reach_another_doctors_patient_by_phone():
    """The exact-phone lookup is intentionally open across branches so
    reception can find an existing record before booking. Open across
    *branches* is not open across *doctors*."""
    client = _client("doctor", {"patient.view": {None}})
    theirs_phone = _patient(THEIRS, "")["phone"]
    assert client.get("/patients", params={"phone": theirs_phone}).json()["items"] == []
    mine_phone = _patient(MINE_A, "")["phone"]
    assert [p["id"] for p in client.get("/patients", params={"phone": mine_phone}).json()["items"]] == [MINE_A]


def test_no_permission_is_rejected():
    assert _client("doctor", {}).get("/patients").status_code == 403
