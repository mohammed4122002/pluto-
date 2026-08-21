"""The bot must ask the patient why they're cancelling before actually
cancelling -- a single, brief question, not an interrogation, and not a
blocker if the patient doesn't answer.

Confirmed live: cancel_appointment always let the model call it with an
empty reason, and the prompt never told the model to ask first -- so a
cancellation went straight through with reason left blank every time.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.routers.chat import BASE_INSTRUCTIONS  # noqa: E402


def test_the_prompt_instructs_asking_for_a_cancellation_reason_first():
    assert "سبب الإلغاء" in BASE_INSTRUCTIONS
    assert "قبل ما تستدعي cancel_appointment" in BASE_INSTRUCTIONS


def test_the_prompt_does_not_insist_if_the_patient_ignores_the_question():
    assert "بدون ما تلحّي عليه أكتر من مرة" in BASE_INSTRUCTIONS
