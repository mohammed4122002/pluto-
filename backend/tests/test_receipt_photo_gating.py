"""handle_inbound_message's receipt-matching call is now gated to
mode=human only.

Previously it fired for ANY inbound image regardless of mode, which meant
an AI-handled conversation could get a photo blindly guessed at as a
payment receipt before /chat/reply (and its Gemini vision classification)
ever ran -- confirmed live, a patient's photo of an injured hand was
answered "we received your payment receipt, reviewing it now." For
mode=human there is no AI turn to defer to, so the backend still auto-
attaches there; for mode=ai, ai-services' submit_payment_receipt tool
decides instead, using the vision classification this endpoint has no way
to compute.
"""

import sys
from pathlib import Path
from unittest.mock import patch
from uuid import uuid4

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.models.schemas import InboundMessage  # noqa: E402
from app.routers.conversations import handle_inbound_message  # noqa: E402
from tests.fake_supabase import FakeSupabase  # noqa: E402

CHANNEL_ID = str(uuid4())
CONVERSATION_ID = str(uuid4())
PATIENT_ID = str(uuid4())
IDENTITY_ID = "identity-1"


def _db(mode: str) -> FakeSupabase:
    return FakeSupabase(
        {
            "channels": [{"id": CHANNEL_ID, "channel_type": "telegram"}],
            "conversations": [
                {
                    "id": CONVERSATION_ID,
                    "mode": mode,
                    "patient_channel_identity_id": IDENTITY_ID,
                    "status": "open",
                    "patient_id": PATIENT_ID,
                }
            ],
            "messages": [],
        }
    )


def _payload() -> InboundMessage:
    return InboundMessage(
        channel_id=CHANNEL_ID,
        message="hi",
        media_url="https://example.test/photo.jpg",
        media_type="image",
        external_user_id="u1",
        provider_type="telegram",
    )


@patch("app.routers.conversations.relay_patient_message_to_assignee")
@patch("app.routers.conversations.attach_receipt_from_inbound_media")
@patch("app.routers.conversations.resolve_identity")
def test_human_mode_conversation_still_auto_attaches(mock_identity, mock_attach, _mock_relay):
    mock_identity.return_value = {"id": IDENTITY_ID, "patient_id": PATIENT_ID}
    db = _db("human")
    handle_inbound_message(_payload(), db)
    mock_attach.assert_called_once_with(db, PATIENT_ID, "https://example.test/photo.jpg")


@patch("app.routers.conversations.attach_receipt_from_inbound_media")
@patch("app.routers.conversations.resolve_identity")
def test_ai_mode_conversation_never_auto_attaches(mock_identity, mock_attach):
    # This is the exact bug: an AI-handled conversation must leave the
    # receipt-vs-not decision to ai-services (which can actually look at the
    # photo), not guess blindly here before the AI turn even runs.
    mock_identity.return_value = {"id": IDENTITY_ID, "patient_id": PATIENT_ID}
    db = _db("ai")
    handle_inbound_message(_payload(), db)
    mock_attach.assert_not_called()
