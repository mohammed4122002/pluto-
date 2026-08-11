"""The Gemini fallback has to produce a request Gemini will accept.

audit_log has been recording the same failure since 2026-08-06:

    BadRequestError: 400 - Requests ending with a model turn are not supported.

Gemini counts an assistant message and the tool results that follow it as one
model turn, so any fallback turn that had reached a tool call was rejected.
The fallback only runs when OpenAI is down, and a booking turn is nothing but
tool calls — so in practice it never worked once. Every one of those patients
got "حد من فريقنا رح يتواصل معك" instead of an answer, and the clinic had no
way to see why.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.routers.chat import _for_gemini  # noqa: E402

A_BOOKING_TURN = [
    {"role": "system", "content": "أنت موظفة استقبال"},
    {"role": "user", "content": "بدي احجز بكرة"},
    {
        "role": "assistant",
        "content": None,
        "tool_calls": [
            {
                "id": "call_1",
                "type": "function",
                "function": {"name": "find_available_slots", "arguments": '{"date_from":"2026-08-12"}'},
            }
        ],
    },
    {"role": "tool", "tool_call_id": "call_1", "content": '{"slots":[]}'},
]


def test_the_request_never_ends_on_the_model():
    assert _for_gemini(A_BOOKING_TURN)[-1]["role"] == "user"


def test_an_assistant_reply_at_the_end_gets_a_user_turn_after_it():
    out = _for_gemini([{"role": "user", "content": "مرحبا"}, {"role": "assistant", "content": "أهلين"}])
    assert out[-1]["role"] == "user"


def test_no_message_has_a_null_content():
    # Legal for OpenAI when the model only called a tool; rejected by Gemini.
    assert all(m["content"] is not None for m in _for_gemini(A_BOOKING_TURN))


def test_the_tool_result_still_reaches_the_model():
    out = _for_gemini(A_BOOKING_TURN)
    assert any('{"slots":[]}' in m["content"] for m in out)


def test_which_tool_was_called_still_reaches_the_model():
    out = _for_gemini(A_BOOKING_TURN)
    assert any("find_available_slots" in m["content"] for m in out)


def test_an_ordinary_exchange_is_left_alone():
    plain = [
        {"role": "system", "content": "s"},
        {"role": "user", "content": "بكم الكشفية؟"},
    ]
    assert _for_gemini(plain) == plain


def test_no_tool_roles_survive():
    assert not any(m["role"] == "tool" for m in _for_gemini(A_BOOKING_TURN))
