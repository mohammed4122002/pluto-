"""/conversations/inbound patient-linking, exercised through the real router.

n8n's live Telegram and WhatsApp workflows send `external_user_id`, not the
legacy `patient_phone` field -- confirmed live: a Telegram patient could
never save contact info or book, because no patient record ever got created
for the conversation (patient_id stayed null), so every save_contact_info/
book_appointment call in ai-services failed its own "no patient linked"
guard and the model just apologized and re-asked in an endless loop. This
covers the fix: a patient must get created/linked from external_user_id
alone, with WhatsApp's external_user_id (a real phone) stored as-is and
Telegram's (a numeric chat id) turned into the same synthetic "tg:{id}"
placeholder the legacy payload used to carry directly.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.core.database import get_supabase  # noqa: E402
from app.core.service_auth import require_service_token  # noqa: E402
from app.routers import conversations  # noqa: E402
from tests.fake_supabase import FakeSupabase  # noqa: E402

CHANNEL_ID = "11111111-1111-4111-8111-111111111111"
IDENTITY_ID = "22222222-2222-4222-8222-222222222222"
CONVERSATION_ID = "33333333-3333-4333-8333-333333333333"


def _db(channel_type: str = "telegram") -> FakeSupabase:
    return FakeSupabase(
        {
            "channels": [{"id": CHANNEL_ID, "channel_type": channel_type, "deleted_at": None}],
            "patient_channel_identities": [
                {
                    "id": IDENTITY_ID,
                    "channel_id": CHANNEL_ID,
                    "provider_type": channel_type,
                    "external_user_id": "555111",
                    "display_name": None,
                    "patient_id": None,
                }
            ],
            "conversations": [
                {
                    "id": CONVERSATION_ID,
                    "channel_id": CHANNEL_ID,
                    "patient_channel_identity_id": IDENTITY_ID,
                    "status": "open",
                    "mode": "ai",
                    "patient_id": None,
                }
            ],
            "messages": [],
            "patients": [],
        }
    )


def _client(db: FakeSupabase) -> TestClient:
    app = FastAPI()
    app.include_router(conversations.router)
    app.dependency_overrides[get_supabase] = lambda: db
    app.dependency_overrides[require_service_token] = lambda: None
    return TestClient(app)


def test_telegram_message_with_no_patient_phone_still_creates_a_patient():
    db = _db("telegram")
    res = _client(db).post(
        "/conversations/inbound",
        json={
            "channel_id": CHANNEL_ID,
            "message": "هلا",
            "external_user_id": "555111",
            "provider_type": "telegram",
            "display_name": "Hisham",
        },
    )
    assert res.status_code == 200
    body = res.json()
    assert body["patient_id"] is not None

    patients = db._tables["patients"]
    assert len(patients) == 1
    assert patients[0]["phone"] == "tg:555111"
    assert patients[0]["full_name"] == "Hisham"

    identity = db._tables["patient_channel_identities"][0]
    assert identity["patient_id"] == patients[0]["id"]
    # A synthetic routing placeholder must never be stored as a contactable
    # phone number on the identity itself.
    assert identity.get("phone_number") is None


def test_whatsapp_message_uses_external_user_id_as_the_real_phone():
    db = _db("whatsapp")
    res = _client(db).post(
        "/conversations/inbound",
        json={
            "channel_id": CHANNEL_ID,
            "message": "هلا",
            "external_user_id": "555111",
            "provider_type": "whatsapp",
            "display_name": "Sara",
        },
    )
    assert res.status_code == 200
    assert res.json()["patient_id"] is not None

    patients = db._tables["patients"]
    assert len(patients) == 1
    assert patients[0]["phone"] == "555111"

    identity = db._tables["patient_channel_identities"][0]
    assert identity.get("phone_number") == "555111"


def test_explicit_patient_phone_still_takes_priority():
    db = _db("telegram")
    res = _client(db).post(
        "/conversations/inbound",
        json={
            "channel_id": CHANNEL_ID,
            "message": "هلا",
            "external_user_id": "555111",
            "patient_phone": "0791234567",
            "provider_type": "telegram",
            "display_name": "Ahmad",
        },
    )
    assert res.status_code == 200
    patients = db._tables["patients"]
    assert len(patients) == 1
    assert patients[0]["phone"] == "0791234567"


def test_already_linked_identity_does_not_create_a_second_patient():
    db = _db("telegram")
    existing_patient_id = "44444444-4444-4444-8444-444444444444"
    db._tables["patients"].append({"id": existing_patient_id, "full_name": "Existing", "phone": "tg:555111"})
    db._tables["patient_channel_identities"][0]["patient_id"] = existing_patient_id

    res = _client(db).post(
        "/conversations/inbound",
        json={
            "channel_id": CHANNEL_ID,
            "message": "هلا تاني",
            "external_user_id": "555111",
            "provider_type": "telegram",
        },
    )
    assert res.status_code == 200
    assert res.json()["patient_id"] == existing_patient_id
    assert len(db._tables["patients"]) == 1
