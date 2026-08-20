"""GET /payments carries branch_id on each result, so the payments dashboard
can show a payment's linked appointment time in that branch's own timezone
instead of the browser's -- see format.ts's TimeZoneOpt comment for the live
incident (a booking correctly stored as 13:00 Asia/Amman rendered as 12:00
for a browser one zone off from the branch) that motivated branch-aware
formatting everywhere a real clinic event's time is displayed.

branch_id was already being resolved locally (to scope the row by
allowed_branch_ids) and simply wasn't attached to the response -- the payment
row itself carries no branch_id column; it comes from the linked appointment
or, for a package payment, the linked patient_package.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.core.auth import CurrentStaff, get_current_staff  # noqa: E402
from app.core.database import get_supabase  # noqa: E402
from app.routers import payments  # noqa: E402
from tests.fake_supabase import FakeSupabase  # noqa: E402

BRANCH = "66666666-6666-4666-8666-666666666666"
PATIENT = "77777777-7777-4777-8777-777777777777"
APPOINTMENT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
PAYMENT_FROM_APPT = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
PACKAGE = "cccccccc-cccc-4ccc-8ccc-cccccccccccc"
PAYMENT_FROM_PACKAGE = "dddddddd-dddd-4ddd-8ddd-dddddddddddd"

ADMIN_PERMISSIONS = {"payment.view": {None}}


def _db() -> FakeSupabase:
    return FakeSupabase(
        {
            "payments": [
                {
                    "id": PAYMENT_FROM_APPT,
                    "appointment_id": APPOINTMENT,
                    "patient_id": PATIENT,
                    "amount": 10.0,
                    "status": "receipt_submitted",
                    "payment_type": "deposit",
                    "created_at": "2026-08-20T09:00:00+00:00",
                    "appointments": {
                        "appointment_number": "APT-20260820-XYZ",
                        "scheduled_at": "2026-08-20T10:00:00+00:00",
                        "branch_id": BRANCH,
                    },
                    "patients": {"full_name": "محمد سعادة", "phone": "0790000000"},
                },
                {
                    "id": PAYMENT_FROM_PACKAGE,
                    "appointment_id": None,
                    "patient_id": PATIENT,
                    "amount": 50.0,
                    "status": "receipt_submitted",
                    "payment_type": "package",
                    "created_at": "2026-08-20T09:00:00+00:00",
                    "patient_packages": {"branch_id": BRANCH},
                    "patients": {"full_name": "محمد سعادة", "phone": "0790000000"},
                },
            ],
        }
    )


def _client(db: FakeSupabase) -> TestClient:
    app = FastAPI()
    app.include_router(payments.router)
    app.dependency_overrides[get_supabase] = lambda: db
    app.dependency_overrides[get_current_staff] = lambda: CurrentStaff(
        id="admin-1", full_name="مدير", email="a@example.com", role="admin", permissions=ADMIN_PERMISSIONS
    )
    return TestClient(app)


def test_a_payment_linked_to_an_appointment_carries_its_branch_id():
    res = _client(_db()).get("/payments")
    assert res.status_code == 200
    by_id = {p["id"]: p for p in res.json()}
    assert by_id[PAYMENT_FROM_APPT]["branch_id"] == BRANCH
    assert by_id[PAYMENT_FROM_APPT]["scheduled_at"] is not None


def test_a_package_payment_carries_its_branch_id_from_the_package():
    # No linked appointment at all -- the branch comes from patient_packages
    # instead, the same fallback the existing branch-scoping logic already
    # used before this field was surfaced to the client.
    res = _client(_db()).get("/payments")
    by_id = {p["id"]: p for p in res.json()}
    assert by_id[PAYMENT_FROM_PACKAGE]["branch_id"] == BRANCH
