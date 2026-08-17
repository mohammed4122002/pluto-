"""Two fixes from one live incident: a stock photo of an injured/burned
hand kept getting classified NONE by vision (not a call failure this time
-- a genuine, wrong classification), and when the patient then described
the symptoms in text instead, the model escalated it as "needs a medical
diagnosis, not my place" and refused to help book at all -- contradicting
BASE_INSTRUCTIONS' own existing rule that describing symptoms to route to
the right specialty is a normal booking question, not an escalation
trigger.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.routers.chat import BASE_INSTRUCTIONS  # noqa: E402
from app.services.vision import _VISION_SYSTEM_PROMPT  # noqa: E402


def test_describing_symptoms_shown_in_a_photo_is_still_not_an_escalation_trigger():
    assert "هذول الأعراض يلي بالصورة" in BASE_INSTRUCTIONS
    assert "لا تفترضي إنه طالب تشخيص لمجرد إنه أشار لصورة" in BASE_INSTRUCTIONS


def test_the_original_non_escalation_rule_and_examples_are_still_intact():
    # The fix must add to the existing rule, not replace or weaken it.
    assert "لا تصعّدي أبداً لمجرد إن المريض وصف عرض أو سبب زيارة" in BASE_INSTRUCTIONS
    assert "عندي سخونة" in BASE_INSTRUCTIONS


def test_vision_prompt_biases_away_from_none_for_any_visible_body_abnormality():
    assert "ولا تصنّفيها NONE أبداً" in _VISION_SYSTEM_PROMPT
    assert "الخطأ الأخطر هون إنك تفوّتي صورة فيها إصابة أو مشكلة حقيقية وتصنّفيها NONE" in _VISION_SYSTEM_PROMPT


def test_none_is_still_explicitly_reserved_for_non_body_photos():
    # The bias must narrow NONE, not remove it -- a genuine receipt/selfie
    # must still classify as NONE for the receipt-matching path to work.
    assert "NONE محجوزة بس للصور اللي فعلاً ما فيها أي جزء جسم غير طبيعي" in _VISION_SYSTEM_PROMPT
