"""The escalation Telegram alert used to show only the single
"last_message_preview" -- which, for a complaint, is often the bot's own
apology reply, not what the patient actually said. It should show the last
few turns of real back-and-forth instead, so a staff member replying from
Telegram actually knows what they're responding to.
"""

import sys
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.escalation import send_escalation_alert  # noqa: E402
from tests.fake_supabase import FakeSupabase  # noqa: E402

STAFF_ID = "staff-1"
CONVERSATION_ID = "conv-1"


def _db(messages: list[dict]) -> FakeSupabase:
    return FakeSupabase(
        {
            "staff": [{"id": STAFF_ID, "telegram_chat_id": "chat-1"}],
            "clinic_settings": [{"id": "cs-1", "staff_bot_token_encrypted": "encrypted-token"}],
            "conversations": [
                {
                    "id": CONVERSATION_ID,
                    "last_message_preview": "ولا يهمك يا كرم، اعتذر منك مرة ثانية",
                    "patients": {"full_name": "كرم الاحمدي", "phone": "0790000001"},
                }
            ],
            "messages": messages,
            "staff_escalation_alerts": [],
        }
    )


def _message(sender_type: str, content: str, created_at: str) -> dict:
    return {"conversation_id": CONVERSATION_ID, "sender_type": sender_type, "content": content, "created_at": created_at}


@patch("app.services.escalation.decrypt_secret", return_value="fake-bot-token")
@patch("app.services.escalation.httpx.post")
def test_alert_includes_last_few_turns_not_just_bot_reply(mock_post, _mock_decrypt):
    mock_post.return_value.json.return_value = {"ok": True, "result": {"message_id": 999}}
    db = _db(
        [
            _message("patient", "بدي اقدم شكوى", "2026-08-08T11:20:00+00:00"),
            _message("ai", "ولا يهمك يا كرم، اعتذر منك مرة ثانية", "2026-08-08T11:20:05+00:00"),
        ]
    )

    send_escalation_alert(db, CONVERSATION_ID, STAFF_ID)

    sent_text = mock_post.call_args.kwargs["json"]["text"]
    assert "بدي اقدم شكوى" in sent_text
    assert "المريض: بدي اقدم شكوى" in sent_text
    assert "المساعد الذكي: ولا يهمك يا كرم، اعتذر منك مرة ثانية" in sent_text


@patch("app.services.escalation.decrypt_secret", return_value="fake-bot-token")
@patch("app.services.escalation.httpx.post")
def test_alert_shows_only_last_four_messages_in_chronological_order(mock_post, _mock_decrypt):
    mock_post.return_value.json.return_value = {"ok": True, "result": {"message_id": 999}}
    db = _db(
        [
            _message("patient", "رسالة 1 - الأقدم", "2026-08-08T11:00:00+00:00"),
            _message("ai", "رسالة 2", "2026-08-08T11:01:00+00:00"),
            _message("patient", "رسالة 3", "2026-08-08T11:02:00+00:00"),
            _message("ai", "رسالة 4", "2026-08-08T11:03:00+00:00"),
            _message("patient", "رسالة 5 - الأحدث", "2026-08-08T11:04:00+00:00"),
        ]
    )

    send_escalation_alert(db, CONVERSATION_ID, STAFF_ID)

    sent_text = mock_post.call_args.kwargs["json"]["text"]
    assert "رسالة 1 - الأقدم" not in sent_text
    assert "رسالة 2" in sent_text
    # Chronological, not reverse -- رسالة 2 has to read before رسالة 5.
    assert sent_text.index("رسالة 2") < sent_text.index("رسالة 5 - الأحدث")


@patch("app.services.escalation.decrypt_secret", return_value="fake-bot-token")
@patch("app.services.escalation.httpx.post")
def test_alert_falls_back_to_preview_when_no_message_history(mock_post, _mock_decrypt):
    mock_post.return_value.json.return_value = {"ok": True, "result": {"message_id": 999}}
    db = _db([])

    send_escalation_alert(db, CONVERSATION_ID, STAFF_ID)

    sent_text = mock_post.call_args.kwargs["json"]["text"]
    assert "ولا يهمك يا كرم، اعتذر منك مرة ثانية" in sent_text
