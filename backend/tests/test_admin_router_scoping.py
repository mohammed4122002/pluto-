"""Self-scope on the shared admin endpoints.

These are the endpoints a self-scoped role still reaches directly (the inbox
is one screen for everyone, and reception/admin share /queues and /services).
Filtering used to happen in the browser, which meant the whole clinic's rows
were shipped there first and then hidden. These pin the filter to the query.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.core.auth import CurrentStaff, get_current_staff  # noqa: E402
from app.core.database import get_supabase  # noqa: E402
from app.routers import conversations, queue, services  # noqa: E402
from tests.fake_supabase import FakeSupabase  # noqa: E402

DOCTOR = "44444444-4444-4444-8444-444444444444"
OTHER = "55555555-5555-4555-8555-555555555555"
BRANCH = "66666666-6666-4666-8666-666666666666"
MY_QUEUE = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
THEIR_QUEUE = "dddddddd-dddd-4ddd-8ddd-dddddddddddd"
MY_SERVICE = "99999999-9999-4999-8999-999999999999"
THEIR_SERVICE = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee"


def _db() -> FakeSupabase:
    return FakeSupabase(
        {
            "queues": [
                {"id": MY_QUEUE, "branch_id": BRANCH, "doctor_id": DOCTOR, "room_id": None, "service_id": None,
                 "queue_date": "2026-08-06", "is_active": True},
                {"id": THEIR_QUEUE, "branch_id": BRANCH, "doctor_id": OTHER, "room_id": None, "service_id": None,
                 "queue_date": "2026-08-06", "is_active": True},
            ],
            "services": [
                {"id": MY_SERVICE, "name": "خدمتي", "description": None, "duration_minutes": 30, "price": None,
                 "specialty_id": None, "is_active": True, "deleted_at": None},
                {"id": THEIR_SERVICE, "name": "خدمة غيري", "description": None, "duration_minutes": 30,
                 "price": None, "specialty_id": None, "is_active": True, "deleted_at": None},
            ],
            "service_doctors": [
                {"service_id": MY_SERVICE, "staff_id": DOCTOR},
                {"service_id": THEIR_SERVICE, "staff_id": OTHER},
            ],
            "conversations": [
                {"id": "11111111-1111-4111-8111-111111111111", "channel_id": "cccccccc-cccc-4ccc-8ccc-cccccccccccc", "status": "open", "mode": "human",
                 "needs_attention": True, "assigned_staff_id": DOCTOR, "last_message_at": None,
                 "last_message_preview": None, "patient_id": "77777777-7777-4777-8777-777777777777",
                 "channels": {"channel_type": "telegram", "branch_id": BRANCH},
                 "patients": {"full_name": "مريضي", "phone": "+962700000001"}},
                {"id": "22222222-2222-4222-8222-222222222222", "channel_id": "cccccccc-cccc-4ccc-8ccc-cccccccccccc", "status": "open", "mode": "human",
                 "needs_attention": True, "assigned_staff_id": OTHER, "last_message_at": None,
                 "last_message_preview": None, "patient_id": "88888888-8888-4888-8888-888888888888",
                 "channels": {"channel_type": "telegram", "branch_id": BRANCH},
                 "patients": {"full_name": "مريض غيري", "phone": "+962700000002"}},
            ],
        }
    )


def _client(router, permissions: dict[str, set], role: str = "doctor") -> TestClient:
    app = FastAPI()
    app.include_router(router)
    app.dependency_overrides[get_supabase] = lambda: _db()
    app.dependency_overrides[get_current_staff] = lambda: CurrentStaff(
        id=DOCTOR, full_name="د. سارة", email="s@example.com", role=role, permissions=permissions
    )
    return TestClient(app)


def test_queues_list_excludes_other_doctors_lines():
    res = _client(queue.router, {"queue.view": {BRANCH}}).get("/queues")
    assert [q["id"] for q in res.json()] == [MY_QUEUE]


def test_receptionist_still_sees_every_queue():
    res = _client(queue.router, {"queue.view": {BRANCH}}, role="receptionist").get("/queues")
    assert {q["id"] for q in res.json()} == {MY_QUEUE, THEIR_QUEUE}


def test_tickets_of_another_doctors_queue_are_refused():
    """Same branch, so branch access passes — ownership is what stops it."""
    client = _client(queue.router, {"queue.view": {BRANCH}})
    assert client.get(f"/queues/{THEIR_QUEUE}/tickets").status_code == 403
    assert client.get(f"/queues/{MY_QUEUE}/tickets").status_code == 200


def test_services_list_narrows_to_the_doctors_own():
    res = _client(services.router, {"service.view": {BRANCH}}).get("/services")
    assert [s["name"] for s in res.json()] == ["خدمتي"]


def test_receptionist_still_sees_the_whole_catalogue():
    res = _client(services.router, {"service.view": {BRANCH}}, role="receptionist").get("/services")
    assert {s["name"] for s in res.json()} == {"خدمتي", "خدمة غيري"}


def test_inbox_shows_only_conversations_escalated_to_me():
    res = _client(conversations.router, {"conversation.view": {BRANCH}}).get("/conversations")
    assert [c["patient_name"] for c in res.json()] == ["مريضي"]


def test_doctor_cannot_ask_for_someone_elses_inbox():
    """An explicit assigned_staff_id must not widen a self-scoped inbox."""
    client = _client(conversations.router, {"conversation.view": {BRANCH}})
    res = client.get("/conversations", params={"assigned_staff_id": OTHER})
    assert res.json() == []
