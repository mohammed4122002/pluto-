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
from app.services.vision import _build_vision_prompt  # noqa: E402

_VISION_SYSTEM_PROMPT = _build_vision_prompt(None)


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


# --- dermatology/cosmetics/dental: offer a photo instead of escalating -----
#
# Confirmed live: a patient described pregnancy stretch marks by text ("شو
# علاجكو؟") with no photo attached, and the model escalated it as a real
# medical-advice request ("شو الدواء المناسب؟" is explicitly listed as an
# escalation trigger) -- technically correct under the old rule, but not
# what a booking assistant for a clinic that already has a working photo-
# analysis feature should do: it should offer the photo option instead of
# punting a routine skin/cosmetic/dental question straight to a human.


def test_a_treatment_question_for_skin_cosmetics_or_dental_does_not_escalate_without_a_photo():
    assert "استثناء لجلدية/تجميل/أسنان بس" in BASE_INSTRUCTIONS
    assert "سؤال عن علاج أو تشخيص لحالة بشرة/شعر/أسنان بدون صورة" in BASE_INSTRUCTIONS
    assert "ممنوع تصعّدي" in BASE_INSTRUCTIONS.split("استثناء لجلدية/تجميل/أسنان بس")[1][:200]


def test_a_medication_question_always_escalates_to_the_specialist_doctor_even_in_derm_cosmetic_dental():
    # A patient asking specifically about a drug/cream/dosage must never be
    # answered with a photo offer or a service name -- medication is a
    # medical-doctor-only topic, with no dermatology/cosmetics/dental carve
    # out (unlike a general treatment/diagnosis question, which does get
    # the photo-offer exception above).
    assert "أي سؤال عن دواء" in BASE_INSTRUCTIONS
    assert "صعّدي دايماً لطبيب التخصص المعني، بلا أي استثناء حتى بجلدية/تجميل/أسنان" in BASE_INSTRUCTIONS
    assert "ممنوع نهائياً تقترحي أو تسمي أي دواء أو كريم علاجي أو مرهم بالاسم" in BASE_INSTRUCTIONS


def test_a_post_procedure_aftercare_routine_is_allowed_but_never_names_a_medication():
    assert "يجوز تذكري روتين عناية عام بعد إجراء معين" in BASE_INSTRUCTIONS
    assert "بدون تسمية أي دواء" in BASE_INSTRUCTIONS


def test_the_exception_is_scoped_to_dermatology_cosmetics_dental_only():
    # Other specialties (internal medicine, cardiology, ENT, orthopedics,
    # pediatrics, OB) keep escalating a real treatment/diagnosis question --
    # this feature only exists for the specialties the photo-analysis
    # feature actually covers well.
    assert "باقي التخصصات تبقى تصعّد عادي" in BASE_INSTRUCTIONS


def test_a_declined_photo_gets_a_service_name_not_a_diagnosis_or_medication():
    assert "list_services بس (مش اسم دواء أو تشخيص)" in BASE_INSTRUCTIONS


def test_first_mention_of_dermatology_cosmetics_or_dental_proactively_offers_a_photo():
    assert "أول مرة" in BASE_INSTRUCTIONS
    assert "يرسل صورة حالته لتشخيص مبدئي وأنسب" in BASE_INSTRUCTIONS
    # Only once per conversation, and not forced on a patient who already
    # sent a photo or already named the exact service they want.
    assert "مرة وحدة بالمحادثة بس" in BASE_INSTRUCTIONS
    assert "ولا تفرضيها لو أصلاً بعت صورة أو حدد الخدمة" in BASE_INSTRUCTIONS
