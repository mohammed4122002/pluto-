"""A patient asking a question about a doctor or service must never be read
as consent to book -- confirmed live: a patient asked "طب هي شاطرة؟" (is
she good?) about a doctor mentioned in the bot's own reply, with no time or
doctor confirmed and no booking ever requested, and the bot booked the
appointment immediately, sending a QR code and appointment number for a
visit she never asked for.

The general "an agreement to the idea of booking isn't the same as picking
a doctor/time" rule already existed and should have covered this, but
didn't stop it in practice -- a plain, positive-sounding question read as
implicit approval. This reinforces the same rule with the exact failure
mode spelled out as a concrete negative example.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.routers.chat import BASE_INSTRUCTIONS  # noqa: E402


def test_a_question_about_the_doctor_is_explicitly_called_out_as_not_consent():
    assert "هي شاطرة؟" in BASE_INSTRUCTIONS
    assert "مش موافقة على الحجز أبداً" in BASE_INSTRUCTIONS


def test_still_requires_an_explicit_confirmation_or_named_time():
    assert "ايوه احجزيلي" in BASE_INSTRUCTIONS
