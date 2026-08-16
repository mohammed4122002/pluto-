"""delete_patient_permanently and the DELETE /patients/{id} endpoint: a
full, hard reset for QA -- unlike the deleted_at soft-delete used elsewhere
in this router, this actually erases the patient's conversations and
channel identity too, so the next message from that same test account
looks genuinely first-contact.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest  # noqa: E402
from fastapi import FastAPI, HTTPException  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.core.auth import CurrentStaff, get_current_staff  # noqa: E402
from app.core.database import get_supabase  # noqa: E402
from app.routers import patients  # noqa: E402
from app.services.patient_management import delete_patient_permanently  # noqa: E402
from tests.fake_supabase import FakeSupabase  # noqa: E402

PATIENT = "11111111-1111-4111-8111-111111111111"
OTHER_PATIENT = "22222222-2222-4222-8222-222222222222"
STAFF_ID = "33333333-3333-4333-8333-333333333333"


def _db() -> FakeSupabase:
    return FakeSupabase(
        {
            "patients": [
                {"id": PATIENT, "full_name": "مريض تجريبي", "phone": "tg:12345"},
                {"id": OTHER_PATIENT, "full_name": "مريض تاني", "phone": "tg:99999"},
            ],
            "conversations": [
                {"id": "c1", "patient_id": PATIENT, "channel_id": "ch1", "status": "open"},
                {"id": "c2", "patient_id": PATIENT, "channel_id": "ch1", "status": "closed"},
                {"id": "c3", "patient_id": OTHER_PATIENT, "channel_id": "ch1", "status": "open"},
            ],
            "patient_channel_identities": [
                {"id": "id1", "patient_id": PATIENT, "channel_id": "ch1", "external_user_id": "12345"},
                {"id": "id2", "patient_id": OTHER_PATIENT, "channel_id": "ch1", "external_user_id": "99999"},
            ],
            "audit_log": [],
        }
    )


def test_deletes_the_patient_and_only_their_conversations_and_identities():
    db = _db()
    delete_patient_permanently(db, PATIENT, STAFF_ID)

    assert [p["id"] for p in db._tables["patients"]] == [OTHER_PATIENT]
    assert [c["id"] for c in db._tables["conversations"]] == ["c3"]
    assert [i["id"] for i in db._tables["patient_channel_identities"]] == ["id2"]


def test_records_an_audit_log_entry_before_the_patient_row_is_gone():
    db = _db()
    delete_patient_permanently(db, PATIENT, STAFF_ID)

    entries = db._tables["audit_log"]
    assert len(entries) == 1
    assert entries[0]["entity_type"] == "patient"
    assert entries[0]["entity_id"] == PATIENT
    assert entries[0]["action"] == "delete"
    assert entries[0]["user_id"] == STAFF_ID
    assert entries[0]["old_value"]["full_name"] == "مريض تجريبي"


def test_deleting_an_unknown_patient_is_a_clear_404():
    db = _db()
    with pytest.raises(HTTPException) as exc_info:
        delete_patient_permanently(db, "does-not-exist", STAFF_ID)
    assert exc_info.value.status_code == 404


def _client(permissions: dict[str, set]) -> TestClient:
    app = FastAPI()
    app.include_router(patients.router)
    db = _db()
    app.dependency_overrides[get_supabase] = lambda: db
    app.dependency_overrides[get_current_staff] = lambda: CurrentStaff(
        id=STAFF_ID, full_name="مديرة العيادة", email="m@example.com", role="clinic_manager", permissions=permissions
    )
    return app, db


def test_endpoint_requires_patient_delete_permission():
    app, _db_ = _client({})
    client = TestClient(app)
    response = client.delete(f"/patients/{PATIENT}")
    assert response.status_code == 403


def test_endpoint_deletes_when_permitted():
    app, db = _client({"patient.delete": {None}})
    client = TestClient(app)
    response = client.delete(f"/patients/{PATIENT}")
    assert response.status_code == 200
    assert response.json() == {"deleted": True}
    assert [p["id"] for p in db._tables["patients"]] == [OTHER_PATIENT]
