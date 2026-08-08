"""A handoff is a conversation, not a single notification.

The escalation alert fired once and that was it: every message the patient
sent afterwards was written to the database and told nobody, because
/chat/reply returns immediately for mode=human and answering once clears
needs_attention. Confirmed live -- a staff member answered a complaint from
Telegram, the patient replied seconds later, and that reply reached no one.
"""

import sys
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.escalation import relay_patient_message_to_assignee  # noqa: E402
from tests.fake_supabase import FakeSupabase  # noqa: E402

CONVERSATION_ID = "conv-1"
ASSIGNEE = "staff-iman"
COLLEAGUE = "staff-ahmad"
FOLLOW_UP = "سوء معاملة"


def _db(*, assigned_to: str | None, assignee_linked: bool = True, bot: bool = True) -> FakeSupabase:
    return FakeSupabase(
        {
            "conversations": [
                {
                    "id": CONVERSATION_ID,
                    "assigned_staff_id": assigned_to,
                    "channels": {"branch_id": "branch-1"},
                    "patients": {"full_name": "كرم الاحمدي"},
                    "last_message_preview": FOLLOW_UP,
                }
            ],
            "staff": [
                {"id": ASSIGNEE, "telegram_chat_id": "chat-iman" if assignee_linked else None},
                {"id": COLLEAGUE, "telegram_chat_id": "chat-ahmad"},
            ],
            "clinic_settings": [{"id": "cs-1", "staff_bot_token_encrypted": "enc" if bot else None}],
            "escalation_staff": [
                {
                    "staff_id": COLLEAGUE,
                    "branch_id": None,
                    "is_active": True,
                    "staff": {"is_active": True, "telegram_chat_id": "chat-ahmad"},
                }
            ],
            "messages": [],
            "staff_escalation_alerts": [],
        }
    )


def _ok(message_id: int):
    class _Resp:
        def json(self):
            return {"ok": True, "result": {"message_id": message_id}}

    return _Resp()


@patch("app.services.escalation.decrypt_secret", return_value="bot-token")
@patch("app.services.escalation.httpx.post")
def test_relays_the_follow_up_to_the_assignee(mock_post, _decrypt):
    mock_post.side_effect = [_ok(201)]
    db = _db(assigned_to=ASSIGNEE)

    assert relay_patient_message_to_assignee(db, CONVERSATION_ID, FOLLOW_UP) is True

    sent = mock_post.call_args.kwargs["json"]
    assert sent["chat_id"] == "chat-iman"
    assert FOLLOW_UP in sent["text"]
    assert "كرم الاحمدي" in sent["text"]


@patch("app.services.escalation.decrypt_secret", return_value="bot-token")
@patch("app.services.escalation.httpx.post")
def test_records_an_alert_row_so_the_reply_can_be_traced_back(mock_post, _decrypt):
    # Reply tracing keys on (staff_id, telegram_message_id). Without a row per
    # relayed message, replying to the newest one would go nowhere.
    mock_post.side_effect = [_ok(201)]
    db = _db(assigned_to=ASSIGNEE)

    relay_patient_message_to_assignee(db, CONVERSATION_ID, FOLLOW_UP)

    row = db.inserts["staff_escalation_alerts"][0]
    assert (row["staff_id"], row["telegram_message_id"], row["conversation_id"]) == (ASSIGNEE, 201, CONVERSATION_ID)


@patch("app.services.escalation.decrypt_secret", return_value="bot-token")
@patch("app.services.escalation.httpx.post")
def test_does_not_wake_the_whole_team_for_a_follow_up(mock_post, _decrypt):
    # Somebody already owns this one; relaying every follow-up to everyone
    # would bury the alerts that do need a fresh pair of eyes.
    mock_post.side_effect = [_ok(201)]
    db = _db(assigned_to=ASSIGNEE)

    relay_patient_message_to_assignee(db, CONVERSATION_ID, FOLLOW_UP)

    assert mock_post.call_count == 1
    assert mock_post.call_args.kwargs["json"]["chat_id"] == "chat-iman"


@patch("app.services.escalation.decrypt_secret", return_value="bot-token")
@patch("app.services.escalation.httpx.post")
def test_falls_back_to_the_pool_when_nobody_is_assigned(mock_post, _decrypt):
    mock_post.side_effect = [_ok(301)]
    db = _db(assigned_to=None)

    assert relay_patient_message_to_assignee(db, CONVERSATION_ID, FOLLOW_UP) is True
    assert mock_post.call_args.kwargs["json"]["chat_id"] == "chat-ahmad"


@patch("app.services.escalation.httpx.post")
def test_unlinked_assignee_is_not_an_error(mock_post):
    db = _db(assigned_to=ASSIGNEE, assignee_linked=False)
    assert relay_patient_message_to_assignee(db, CONVERSATION_ID, FOLLOW_UP) is False
    mock_post.assert_not_called()


@patch("app.services.escalation.httpx.post")
def test_no_bot_configured_is_not_an_error(mock_post):
    db = _db(assigned_to=ASSIGNEE, bot=False)
    assert relay_patient_message_to_assignee(db, CONVERSATION_ID, FOLLOW_UP) is False
    mock_post.assert_not_called()


@patch("app.services.escalation.decrypt_secret", return_value="bot-token")
@patch("app.services.escalation.httpx.post")
def test_a_telegram_failure_never_propagates(mock_post, _decrypt):
    # Recording the patient's message is the part that must not be lost, so a
    # relay failure has to stay contained.
    mock_post.side_effect = RuntimeError("telegram down")
    db = _db(assigned_to=ASSIGNEE)
    assert relay_patient_message_to_assignee(db, CONVERSATION_ID, FOLLOW_UP) is False
