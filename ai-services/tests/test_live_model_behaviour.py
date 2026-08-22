"""Does the model actually FOLLOW the prompt? -- opt-in, makes real API calls.

Every other test here proves the code behaves correctly once the model
decides to call a tool. None of them can catch the failure mode that has
produced most of the live incidents in this project: the rule is in the
prompt, the code is correct, and the model just doesn't obey. That was the
whole shape of "a question booked an appointment" -- no code was wrong.

Skipped by default so the normal suite stays fast, free and offline. To run:

    export PLUTO_LIVE_LLM_TESTS=1
    export OPENAI_API_KEY=sk-...          # or GEMINI_API_KEY=...
    python -m pytest tests/test_live_model_behaviour.py -v

Each case sends the REAL system prompt and the REAL tool definitions, then
asserts only on which tools the model chose to call -- never on the wording
of the reply, which is free to vary. A failure here means the prompt needs
to change (or a rule needs to become a code-level gate), not that the test
is flaky -- though with a nonzero temperature any single run is a sample,
so REPEATS runs each case more than once and requires every attempt to
hold.
"""

import os
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest  # noqa: E402

from app.routers.chat import REPLY_SCHEMA, TOOLS, _build_system_prompt  # noqa: E402
from tests.test_end_to_end_booking_scenarios import AMMAN, _Db, _tables  # noqa: E402

ENABLED = os.getenv("PLUTO_LIVE_LLM_TESTS") == "1"
OPENAI_KEY = os.getenv("OPENAI_API_KEY")
GEMINI_KEY = os.getenv("GEMINI_API_KEY")

pytestmark = pytest.mark.skipif(
    not ENABLED or not (OPENAI_KEY or GEMINI_KEY),
    reason="live model tests are opt-in: set PLUTO_LIVE_LLM_TESTS=1 and an API key",
)

# One sample can pass by luck. Every repeat must hold for the case to pass.
REPEATS = int(os.getenv("PLUTO_LIVE_LLM_REPEATS", "3"))

GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai/"

DAY = (datetime.now(timezone.utc) + timedelta(days=3)).replace(hour=6, minute=0, second=0, microsecond=0)
SLOT_LOCAL = DAY.astimezone(timezone(timedelta(hours=3))).isoformat()


def _client_and_model():
    from openai import OpenAI

    if OPENAI_KEY:
        return OpenAI(api_key=OPENAI_KEY, timeout=30.0), "gpt-4o-mini"
    return OpenAI(api_key=GEMINI_KEY, base_url=GEMINI_BASE_URL, timeout=30.0), os.getenv(
        "GEMINI_MODEL", "gemini-2.0-flash"
    )


def _system_prompt(patient_registered=True):
    db = _Db(_tables())
    if patient_registered:
        db.tables["patients"].rows[0].update({"full_name": "مريم أحمد سالم", "phone": "0790000000"})
    return _build_system_prompt(
        db, AMMAN, {}, db.tables["patients"].rows[0]["id"], branch_selected_explicitly=True
    )


def _tools_called(history, patient_registered=True):
    """The set of tool names the model chose to call for this turn."""
    client, model = _client_and_model()
    messages = [{"role": "system", "content": _system_prompt(patient_registered)}] + history
    completion = client.chat.completions.create(
        model=model, messages=messages, tools=TOOLS, response_format=REPLY_SCHEMA
    )
    calls = completion.choices[0].message.tool_calls or []
    return {c.function.name for c in calls}


def _assert_every_run(history, *, must_not_call=(), must_call=(), registered=True):
    for attempt in range(REPEATS):
        called = _tools_called(history, registered)
        for name in must_not_call:
            assert name not in called, (
                f"attempt {attempt + 1}/{REPEATS}: model called {name} when it must not. called={called}"
            )
        for name in must_call:
            assert name in called, (
                f"attempt {attempt + 1}/{REPEATS}: model did not call {name}. called={called}"
            )


# A turn where times have just been offered and nothing has been confirmed.
_SLOTS_OFFERED = [
    {"role": "user", "content": "بدي احجز كشفية جلدية"},
    {
        "role": "assistant",
        "content": "أكيد! عندنا د. سارة الخطيب متاحة. أقرب موعد "
        f"{SLOT_LOCAL[:10]} الساعة 09:00 ص. تحبي أحجزلك؟",
    },
]


def test_a_question_about_the_doctor_does_not_book():
    """The exact live incident: "طب هي شاطرة؟" booked a real appointment."""
    _assert_every_run(
        _SLOTS_OFFERED + [{"role": "user", "content": "طب هي شاطره؟"}],
        must_not_call=("book_appointment",),
    )


def test_a_bare_yes_to_a_generic_offer_does_not_book():
    _assert_every_run(
        [
            {"role": "user", "content": "بدي احجز موعد"},
            {"role": "assistant", "content": "أكيد، بدك تحجزي؟"},
            {"role": "user", "content": "نعم"},
        ],
        must_not_call=("book_appointment",),
    )


def test_asking_about_experience_does_not_book():
    _assert_every_run(
        _SLOTS_OFFERED + [{"role": "user", "content": "كم سنة خبرتها؟"}],
        must_not_call=("book_appointment",),
    )


def test_an_explicit_yes_with_a_named_time_does_book():
    """The other side of the same rule -- the guard must not be so tight that
    a real confirmation stops working."""
    _assert_every_run(
        _SLOTS_OFFERED + [{"role": "user", "content": "ايوه احجزيلي الساعة 9 مع د. سارة الخطيب"}],
        must_call=("book_appointment",),
    )


def test_asking_whether_cancelling_is_possible_does_not_cancel():
    _assert_every_run(
        [
            {"role": "user", "content": "عندي موعد بكرة"},
            {"role": "assistant", "content": "أيوه، عندك موعد مع د. سارة الخطيب."},
            {"role": "user", "content": "بقدر ألغي موعدي؟"},
        ],
        must_not_call=("cancel_appointment",),
    )


def test_naming_another_branch_switches_the_branch_first():
    """Searching without select_branch silently searches the old branch --
    the live "ما في مواعيد بفرع عمان" loop."""
    _assert_every_run(
        [
            {"role": "user", "content": "بدي جلسة ليزر"},
            {"role": "assistant", "content": "للأسف ما لقيت مواعيد متاحة لجلسة الليزر بهذا الفرع."},
            {"role": "user", "content": "لا بفرع عيادة بلوتو - إربد"},
        ],
        must_call=("select_branch",),
    )


def test_a_registered_patient_is_not_asked_for_their_name_again():
    _assert_every_run(
        _SLOTS_OFFERED + [{"role": "user", "content": "ايوه احجزيلي الساعة 9 مع د. سارة الخطيب"}],
        must_not_call=("save_contact_info",),
    )
