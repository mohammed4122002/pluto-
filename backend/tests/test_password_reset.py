"""Self-service password reset, exercised through the real router.

Two things matter here and are easy to lose in a refactor:
1. /auth/forgot-password never reveals whether an email is registered, or
   whether that account has Telegram linked -- the response text and status
   code must be identical across every "nothing to do here" path.
2. a reset token is single-use and time-boxed -- it must not work a second
   time, and must not work past its expiry.
"""

import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.core.database import get_supabase  # noqa: E402
from app.core.security import hash_password, hash_reset_token, verify_password  # noqa: E402
from app.routers import auth  # noqa: E402
from tests.fake_supabase import FakeSupabase  # noqa: E402

STAFF_ID = "11111111-1111-4111-8111-111111111111"
EMAIL = "doctor@example.com"
CHAT_ID = "555111"


def _staff_row(**overrides) -> dict:
    row = {
        "id": STAFF_ID,
        "email": EMAIL,
        "is_active": True,
        "telegram_chat_id": CHAT_ID,
        "password_hash": hash_password("old-password"),
        "password_reset_token_hash": None,
        "password_reset_expires_at": None,
        "failed_login_attempts": 3,
        "locked_until": None,
    }
    row.update(overrides)
    return row


def _db(staff_row: dict | None = None, bot_token: str | None = "123:abc") -> FakeSupabase:
    return FakeSupabase(
        {
            "staff": [staff_row] if staff_row else [],
            "clinic_settings": [{"staff_bot_token_encrypted": None}],
        }
    )


def _client(db: FakeSupabase) -> TestClient:
    app = FastAPI()
    app.include_router(auth.router)
    app.dependency_overrides[get_supabase] = lambda: db
    return TestClient(app)


def _patch_telegram(monkeypatch):
    """Stands in for the real Telegram send and the staff-bot token lookup
    so no test ever makes a network call. Records every send so a test can
    assert on exactly what would have gone out."""
    sent = []

    def fake_post(url, json, timeout):
        sent.append({"url": url, "json": json})

        class _Resp:
            def json(self_inner):
                return {"ok": True}

        return _Resp()

    monkeypatch.setattr(auth.httpx, "post", fake_post)
    monkeypatch.setattr(auth, "_staff_bot_token", lambda db: "123:abc")
    return sent


def test_forgot_password_unknown_email_returns_generic_message(monkeypatch):
    sent = _patch_telegram(monkeypatch)
    db = _db(staff_row=None)
    res = _client(db).post("/auth/forgot-password", json={"email": "nobody@example.com"})
    assert res.status_code == 200
    assert res.json() == auth._FORGOT_PASSWORD_GENERIC_RESPONSE
    assert sent == []


def test_forgot_password_known_email_without_telegram_link_returns_same_message(monkeypatch):
    sent = _patch_telegram(monkeypatch)
    db = _db(_staff_row(telegram_chat_id=None))
    res = _client(db).post("/auth/forgot-password", json={"email": EMAIL})
    assert res.status_code == 200
    assert res.json() == auth._FORGOT_PASSWORD_GENERIC_RESPONSE
    assert sent == []
    # No token was issued for an account nothing can be delivered to.
    assert db._tables["staff"][0]["password_reset_token_hash"] is None


def test_forgot_password_inactive_staff_returns_same_message(monkeypatch):
    sent = _patch_telegram(monkeypatch)
    db = _db(_staff_row(is_active=False))
    res = _client(db).post("/auth/forgot-password", json={"email": EMAIL})
    assert res.status_code == 200
    assert res.json() == auth._FORGOT_PASSWORD_GENERIC_RESPONSE
    assert sent == []


def test_forgot_password_linked_staff_gets_a_telegram_message_with_the_link(monkeypatch):
    sent = _patch_telegram(monkeypatch)
    db = _db(_staff_row())
    res = _client(db).post(
        "/auth/forgot-password", json={"email": EMAIL}, headers={"origin": "https://clinic-frontend.example"}
    )
    assert res.status_code == 200
    assert res.json() == auth._FORGOT_PASSWORD_GENERIC_RESPONSE

    assert len(sent) == 1
    assert sent[0]["json"]["chat_id"] == CHAT_ID
    text = sent[0]["json"]["text"]
    assert "https://clinic-frontend.example/?reset_token=" in text

    row = db._tables["staff"][0]
    assert row["password_reset_token_hash"] is not None
    # The stored value is a hash, never the raw token that went out on Telegram.
    assert row["password_reset_token_hash"] not in text
    expires = datetime.fromisoformat(row["password_reset_expires_at"])
    assert expires > datetime.now(timezone.utc)


def test_forgot_password_survives_a_telegram_delivery_failure(monkeypatch):
    def raising_post(*_args, **_kwargs):
        raise RuntimeError("network is down")

    monkeypatch.setattr(auth.httpx, "post", raising_post)
    monkeypatch.setattr(auth, "_staff_bot_token", lambda db: "123:abc")
    db = _db(_staff_row())
    res = _client(db).post("/auth/forgot-password", json={"email": EMAIL})
    # A delivery hiccup must not surface as a 500 -- same generic response either way.
    assert res.status_code == 200
    assert res.json() == auth._FORGOT_PASSWORD_GENERIC_RESPONSE


def test_reset_password_rejects_an_unknown_token():
    db = _db(_staff_row())
    res = _client(db).post("/auth/reset-password", json={"token": "not-a-real-token", "new_password": "new-pass-123"})
    assert res.status_code == 400


def test_reset_password_rejects_an_expired_token():
    token = "a-real-token"
    expired = datetime.now(timezone.utc) - timedelta(minutes=1)
    db = _db(
        _staff_row(
            password_reset_token_hash=hash_reset_token(token),
            password_reset_expires_at=expired.isoformat(),
        )
    )
    res = _client(db).post("/auth/reset-password", json={"token": token, "new_password": "new-pass-123"})
    assert res.status_code == 400
    # The old password must still be the one that works.
    assert verify_password("old-password", db._tables["staff"][0]["password_hash"])


def test_reset_password_with_a_valid_token_changes_the_password_and_clears_lockout():
    token = "a-real-token"
    future = datetime.now(timezone.utc) + timedelta(minutes=10)
    db = _db(
        _staff_row(
            password_reset_token_hash=hash_reset_token(token),
            password_reset_expires_at=future.isoformat(),
            failed_login_attempts=5,
            locked_until=(datetime.now(timezone.utc) + timedelta(minutes=15)).isoformat(),
        )
    )
    res = _client(db).post("/auth/reset-password", json={"token": token, "new_password": "brand-new-pass-123"})
    assert res.status_code == 200
    assert res.json() == {"reset": True}

    row = db._tables["staff"][0]
    assert verify_password("brand-new-pass-123", row["password_hash"])
    assert not verify_password("old-password", row["password_hash"])
    assert row["password_reset_token_hash"] is None
    assert row["password_reset_expires_at"] is None
    assert row["failed_login_attempts"] == 0
    assert row["locked_until"] is None


def test_reset_password_token_is_single_use():
    token = "a-real-token"
    future = datetime.now(timezone.utc) + timedelta(minutes=10)
    db = _db(
        _staff_row(
            password_reset_token_hash=hash_reset_token(token),
            password_reset_expires_at=future.isoformat(),
        )
    )
    client = _client(db)
    first = client.post("/auth/reset-password", json={"token": token, "new_password": "first-new-pass-1"})
    assert first.status_code == 200

    second = client.post("/auth/reset-password", json={"token": token, "new_password": "second-new-pass-2"})
    assert second.status_code == 400
