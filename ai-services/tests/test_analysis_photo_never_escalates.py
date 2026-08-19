"""An analysed photo must produce the analysis card, not a hand-off.

BASE_INSTRUCTIONS tells the model to escalate "a request for a
consultation, diagnosis, or real medical opinion" -- and a photo of a rash
reads as exactly that, so the model kept escalating instead of answering,
which is the entire point of the feature. Confirmed live more than once:
a photo of an infant's rash, correctly classified by the vision model as
"طفح جلدي بسيط", was answered with "this is a medical question, someone
from the team will contact you". That also flipped the conversation into
human mode, so the patient's next photo received no reply at all.

The prompt now states the exception, but the model had already overridden
it repeatedly, so the guarantee is enforced in code as well.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.routers.chat import (  # noqa: E402
    ADMINISTRATIVE,
    MEDICAL,
    _build_system_prompt,
    _suppress_medical_escalation_on_analysed_photo,
)
from tests.test_qa_photo_and_dialect_gaps import _PromptDb, _TWO_BRANCHES  # noqa: E402


def test_a_medical_escalation_on_an_analysed_photo_is_dropped():
    assert _suppress_medical_escalation_on_analysed_photo("analysis", True, MEDICAL) == (False, MEDICAL)


def test_an_urgent_photo_still_escalates():
    # A different classification entirely -- this one is supposed to reach a
    # human, and fast.
    assert _suppress_medical_escalation_on_analysed_photo("urgent", True, MEDICAL) == (True, MEDICAL)


def test_a_complaint_raised_alongside_a_photo_still_escalates():
    # The feature replaces "answer this photo", not "handle my complaint".
    assert _suppress_medical_escalation_on_analysed_photo("analysis", True, ADMINISTRATIVE) == (True, ADMINISTRATIVE)


def test_a_turn_with_no_photo_is_untouched():
    assert _suppress_medical_escalation_on_analysed_photo(None, True, MEDICAL) == (True, MEDICAL)


def test_a_receipt_photo_is_untouched():
    assert _suppress_medical_escalation_on_analysed_photo("receipt", True, MEDICAL) == (True, MEDICAL)


def test_a_turn_that_did_not_escalate_stays_that_way():
    assert _suppress_medical_escalation_on_analysed_photo("analysis", False, MEDICAL) == (False, MEDICAL)


def test_the_prompt_also_states_the_exception_explicitly():
    prompt = _build_system_prompt(
        _PromptDb(_TWO_BRANCHES),
        "b1",
        {},
        patient_id=None,
        photo_description="النوع: طفح جلدي بسيط",
        branch_selected_explicitly=True,
        photo_kind="analysis",
    )
    assert "ممنوع منعاً باتاً تصعّدي هون، ولازم needs_human=false" in prompt
    # The phrasings patients actually use when sending a photo.
    for asked in ("شو هاد؟", "طفلي بيعاني من هيك", "هل هاد خطير؟"):
        assert asked in prompt
