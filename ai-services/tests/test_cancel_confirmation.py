"""Asking whether you can cancel is not asking to cancel.

The prompt has always said so: "أكدي مع المريض صراحة إنه بدو يلغي فعلاً قبل
استدعاء cancel_appointment — ما تلغي بمجرد إنه سأل 'بقدر ألغي موعدي؟'".

Live, the patient wrote "لا خلص، أنا أصلا عندي موعد محجوز. بقدر ألغيه؟" and
the appointment was cancelled on the spot, with the reply "تمام يا لينا،
إلغيتلك الموعد". Cancelling cannot be undone, and under an active cancellation
policy it also charges a fee — for something the patient only enquired about.

So the rule stopped being advice.
"""

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.routers.chat import _cancel_needs_confirmation  # noqa: E402


def test_the_question_that_actually_cancelled_an_appointment():
    ctx = {"last_patient_message": "لا خلص، أنا أصلا عندي موعد محجوز. بقدر ألغيه؟"}
    assert _cancel_needs_confirmation(ctx) is True


@pytest.mark.parametrize(
    "message",
    [
        "بقدر ألغي موعدي؟",
        "ممكن تلغيلي الموعد؟",
        "في رسوم إذا ألغيت؟",
        "هل بينفع أغير الموعد؟",
        "can I cancel my appointment?",
    ],
)
def test_questions_need_the_patient_asked_first(message):
    assert _cancel_needs_confirmation({"last_patient_message": message}) is True


@pytest.mark.parametrize(
    "message",
    [
        "الغي موعدي",
        "ألغيه لو سمحت",
        "اي متأكدة، الغيه",
        "نعم",
        "اوك الغيه وشكرا",
    ],
)
def test_an_instruction_goes_straight_through(message):
    assert _cancel_needs_confirmation({"last_patient_message": message}) is False


def test_a_question_after_the_assistant_asked_is_an_answer():
    # "متأكدة بدك تلغي الموعد؟" -> "اي متأكدة، بس في رسوم؟" is a yes.
    ctx = {"last_patient_message": "اي متأكدة، بس في رسوم؟", "cancel_confirmation_asked": True}
    assert _cancel_needs_confirmation(ctx) is False


def test_no_message_at_all_is_treated_as_unconfirmed():
    assert _cancel_needs_confirmation({}) is True
    assert _cancel_needs_confirmation({"last_patient_message": "   "}) is True
