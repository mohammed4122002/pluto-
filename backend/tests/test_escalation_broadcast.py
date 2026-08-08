"""Escalation alerts go to the whole linked pool, not just the assignee.

They share one clinic bot but each staff member has their own chat_id, so a
broadcast is one send per person. Notifying only the assignee meant an
escalation waited on one specific person being free while colleagues on the
same duty roster never knew it existed.
"""

import sys
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.escalation import broadcast_escalation_alert, send_escalation_alert  # noqa: E402
from tests.fake_supabase import FakeSupabase  # noqa: E402

CONVERSATION_ID = "conv-1"
IMAN = "staff-iman"
AHMAD = "staff-ahmad"
UNLINKED = "staff-unlinked"


def _pool_row(staff_id: str, chat_id: str | None, *, is_active: bool = True) -> dict:
    return {
        "staff_id": staff_id,
        "branch_id": None,
        "is_active": True,
        "staff": {"is_active": is_active, "telegram_chat_id": chat_id},
    }


def _db(pool: list[dict], *, bot_configured: bool = True) -> FakeSupabase:
    return FakeSupabase(
        {
            "escalation_staff": pool,
            "clinic_settings": [
                {"id": "cs-1", "staff_bot_token_encrypted": "encrypted" if bot_configured else None}
            ],
            "conversations": [
                {
                    "id": CONVERSATION_ID,
                    "last_message_preview": "بدي اقدم شكوى",
                    "patients": {"full_name": "كرم الاحمدي", "phone": "0790000001"},
                }
            ],
            "messages": [
                {
                    "conversation_id": CONVERSATION_ID,
                    "sender_type": "patient",
                    "content": "بدي اقدم شكوى",
                    "created_at": "2026-08-08T11:20:00+00:00",
                }
            ],
            "staff": [
                {"id": IMAN, "telegram_chat_id": "chat-iman"},
                {"id": AHMAD, "telegram_chat_id": "chat-ahmad"},
                {"id": UNLINKED, "telegram_chat_id": None},
            ],
            "staff_escalation_alerts": [],
        }
    )


def _ok_response(message_id: int):
    class _Resp:
        def json(self):
            return {"ok": True, "result": {"message_id": message_id}}

    return _Resp()


@patch("app.services.escalation.decrypt_secret", return_value="bot-token")
@patch("app.services.escalation.httpx.post")
def test_alerts_every_linked_pool_member(mock_post, _decrypt):
    mock_post.side_effect = [_ok_response(101), _ok_response(102)]
    db = _db([_pool_row(IMAN, "chat-iman"), _pool_row(AHMAD, "chat-ahmad")])

    assert broadcast_escalation_alert(db, CONVERSATION_ID, None) == 2

    chat_ids = [call.kwargs["json"]["chat_id"] for call in mock_post.call_args_list]
    assert sorted(chat_ids) == ["chat-ahmad", "chat-iman"]


@patch("app.services.escalation.decrypt_secret", return_value="bot-token")
@patch("app.services.escalation.httpx.post")
def test_each_recipient_gets_its_own_alert_row_for_reply_tracing(mock_post, _decrypt):
    # Reply tracing keys on (staff_id, telegram_message_id), so every
    # recipient needs their own row -- otherwise only one of them could
    # actually reply and have it reach the patient.
    mock_post.side_effect = [_ok_response(101), _ok_response(102)]
    db = _db([_pool_row(IMAN, "chat-iman"), _pool_row(AHMAD, "chat-ahmad")])

    broadcast_escalation_alert(db, CONVERSATION_ID, None)

    rows = db.inserts["staff_escalation_alerts"]
    assert {(r["staff_id"], r["telegram_message_id"]) for r in rows} == {(IMAN, 101), (AHMAD, 102)}
    assert all(r["conversation_id"] == CONVERSATION_ID for r in rows)


@patch("app.services.escalation.decrypt_secret", return_value="bot-token")
@patch("app.services.escalation.httpx.post")
def test_skips_unlinked_and_deactivated_staff(mock_post, _decrypt):
    mock_post.side_effect = [_ok_response(101)]
    db = _db(
        [
            _pool_row(IMAN, "chat-iman"),
            _pool_row(UNLINKED, None),
            _pool_row(AHMAD, "chat-ahmad", is_active=False),
        ]
    )

    assert broadcast_escalation_alert(db, CONVERSATION_ID, None) == 1
    assert mock_post.call_args.kwargs["json"]["chat_id"] == "chat-iman"


@patch("app.services.escalation.decrypt_secret", return_value="bot-token")
@patch("app.services.escalation.httpx.post")
def test_one_failing_recipient_does_not_stop_the_others(mock_post, _decrypt):
    mock_post.side_effect = [RuntimeError("telegram exploded"), _ok_response(102)]
    db = _db([_pool_row(IMAN, "chat-iman"), _pool_row(AHMAD, "chat-ahmad")])

    assert broadcast_escalation_alert(db, CONVERSATION_ID, None) == 1
    assert db.inserts["staff_escalation_alerts"][0]["staff_id"] == AHMAD


@patch("app.services.escalation.httpx.post")
def test_no_sends_when_nobody_is_linked(mock_post):
    db = _db([_pool_row(UNLINKED, None)])
    assert broadcast_escalation_alert(db, CONVERSATION_ID, None) == 0
    mock_post.assert_not_called()


@patch("app.services.escalation.httpx.post")
def test_no_sends_when_bot_is_not_configured(mock_post):
    db = _db([_pool_row(IMAN, "chat-iman")], bot_configured=False)
    assert broadcast_escalation_alert(db, CONVERSATION_ID, None) == 0
    mock_post.assert_not_called()


@patch("app.services.escalation.decrypt_secret", return_value="bot-token")
@patch("app.services.escalation.httpx.post")
def test_manual_handoff_still_alerts_only_the_named_colleague(mock_post, _decrypt):
    # A deliberate dashboard hand-off to one person must not turn into a
    # team-wide broadcast.
    mock_post.side_effect = [_ok_response(101)]
    db = _db([_pool_row(IMAN, "chat-iman"), _pool_row(AHMAD, "chat-ahmad")])

    send_escalation_alert(db, CONVERSATION_ID, AHMAD)

    assert mock_post.call_count == 1
    assert mock_post.call_args.kwargs["json"]["chat_id"] == "chat-ahmad"
