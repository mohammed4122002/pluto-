"""GET /conversations and GET /conversations/{id} must never 500 just
because one conversation has no patient linked yet.

Confirmed live: two conversations created around the patient-linking fix
(see test_conversations_inbound.py) had patient_id still null -- one from
before the fix deployed, one because reusing an already-open conversation
never re-synced its own patient_id once the identity picked one up later.
Supabase embeds patients(...) as null (not {}) when patient_id is null, and
the router assumed it was always a dict -- `patient["full_name"]` raised
TypeError and took the whole dashboard list down, not just that one row.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.core.auth import CurrentStaff, get_current_staff  # noqa: E402
from app.core.database import get_supabase  # noqa: E402
from app.core.scoping import StaffScope, get_staff_scope  # noqa: E402
from app.core.service_auth import require_service_token  # noqa: E402
from app.routers import conversations  # noqa: E402
from tests.fake_supabase import FakeSupabase  # noqa: E402

CHANNEL_ID = "11111111-1111-4111-8111-111111111111"
IDENTITY_A = "22222222-2222-4222-8222-222222222222"
IDENTITY_B = "55555555-5555-4555-8555-555555555555"
CONVERSATION_ORPHAN = "33333333-3333-4333-8333-333333333333"
CONVERSATION_LINKED = "66666666-6666-4666-8666-666666666666"
PATIENT_ID = "77777777-7777-4777-8777-777777777777"
BRANCH_ID = "88888888-8888-4888-8888-888888888888"

ADMIN_PERMISSIONS = {"conversation.view": {None}}


def _db() -> FakeSupabase:
    return FakeSupabase(
        {
            "channels": [{"id": CHANNEL_ID, "channel_type": "telegram", "branch_id": BRANCH_ID, "deleted_at": None}],
            "patient_channel_identities": [
                {"id": IDENTITY_A, "channel_id": CHANNEL_ID, "external_user_id": "555111", "patient_id": None},
                {"id": IDENTITY_B, "channel_id": CHANNEL_ID, "external_user_id": "555222", "patient_id": PATIENT_ID},
            ],
            "conversations": [
                {
                    "id": CONVERSATION_ORPHAN,
                    "channel_id": CHANNEL_ID,
                    "patient_channel_identity_id": IDENTITY_A,
                    "status": "open",
                    "mode": "ai",
                    "needs_attention": False,
                    "assigned_staff_id": None,
                    "last_message_at": "2026-09-01T16:03:35Z",
                    "last_message_preview": "هلا",
                    "patient_id": None,
                    # FakeSupabase does no real joining -- these mirror what
                    # PostgREST's channels(...)/patients(...) embed would
                    # actually return for this row (patients: null here,
                    # since patient_id is null).
                    "channels": {"channel_type": "telegram", "branch_id": BRANCH_ID},
                    "patients": None,
                },
                {
                    "id": CONVERSATION_LINKED,
                    "channel_id": CHANNEL_ID,
                    "patient_channel_identity_id": IDENTITY_B,
                    "status": "open",
                    "mode": "ai",
                    "needs_attention": False,
                    "assigned_staff_id": None,
                    "last_message_at": "2026-09-01T16:04:00Z",
                    "last_message_preview": "هلا",
                    "patient_id": PATIENT_ID,
                    "channels": {"channel_type": "telegram", "branch_id": BRANCH_ID},
                    "patients": {"full_name": "سارة", "phone": "0791234567"},
                },
            ],
            "patients": [{"id": PATIENT_ID, "full_name": "سارة", "phone": "0791234567"}],
            "messages": [],
        }
    )


def _client(db: FakeSupabase) -> TestClient:
    app = FastAPI()
    app.include_router(conversations.router)
    current = CurrentStaff(
        id="admin-1", full_name="مدير", email="a@example.com", role="admin", permissions=ADMIN_PERMISSIONS
    )
    app.dependency_overrides[get_supabase] = lambda: db
    app.dependency_overrides[get_current_staff] = lambda: current
    app.dependency_overrides[get_staff_scope] = lambda: StaffScope(db, current)
    app.dependency_overrides[require_service_token] = lambda: None
    return TestClient(app)


def test_list_conversations_omits_an_orphaned_row_instead_of_500ing():
    db = _db()
    res = _client(db).get("/conversations")
    assert res.status_code == 200
    ids = [c["id"] for c in res.json()]
    assert CONVERSATION_ORPHAN not in ids
    assert CONVERSATION_LINKED in ids


def test_get_conversation_on_an_orphaned_row_returns_a_clean_409():
    db = _db()
    res = _client(db).get(f"/conversations/{CONVERSATION_ORPHAN}")
    assert res.status_code == 409


def test_get_conversation_on_a_linked_row_still_works():
    db = _db()
    res = _client(db).get(f"/conversations/{CONVERSATION_LINKED}")
    assert res.status_code == 200
    body = res.json()
    assert body["patient_name"] == "سارة"
    assert body["patient_phone"] == "0791234567"


def test_reused_open_conversation_gets_its_patient_id_backfilled():
    """The bug behind CONVERSATION_ORPHAN in the fixture above: an identity
    with no patient yet gets one linked on a later message (e.g. via
    save_contact_info, simulated here by pre-linking IDENTITY_A), but the
    already-open conversation from before that never revisits its own
    patient_id -- until this inbound call, which must backfill it."""
    db = _db()
    db._tables["patient_channel_identities"][0]["patient_id"] = PATIENT_ID

    res = _client(db).post(
        "/conversations/inbound",
        json={
            "channel_id": CHANNEL_ID,
            "message": "تاني",
            "external_user_id": "555111",
            "provider_type": "telegram",
        },
    )
    assert res.status_code == 200
    assert res.json()["patient_id"] == PATIENT_ID

    conv = next(c for c in db._tables["conversations"] if c["id"] == CONVERSATION_ORPHAN)
    assert conv["patient_id"] == PATIENT_ID
