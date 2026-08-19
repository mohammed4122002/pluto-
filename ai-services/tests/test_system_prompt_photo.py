"""The photo-analysis block _build_system_prompt injects when a patient's
most recent message carried an image, classified by describe_patient_photo
into "urgent" / "analysis" / not-medical-at-all.

"analysis" is allowed to relay common, low-stakes concerns by name (acne,
hair loss...) -- but the one rule that must never be violated in any branch
is that the model reading this prompt is a booking assistant, not a doctor:
nothing here may read as permission to state a real diagnosis. "urgent"
must always push toward real medical care, never a routine "let's book you
a service" card.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.routers.chat import _build_system_prompt  # noqa: E402


class _Query:
    def __init__(self, rows):
        self._rows = rows

    def select(self, *_a, **_k):
        return self

    def eq(self, column, value):
        self._rows = [r for r in self._rows if r.get(column) == value]
        return self

    def is_(self, column, value):
        target = None if value == "null" else value
        self._rows = [r for r in self._rows if r.get(column) == target]
        return self

    def limit(self, *_a, **_k):
        return self

    def execute(self):
        return _Result(self._rows)


class _Result:
    def __init__(self, data):
        self.data = data


class _Db:
    def __init__(self, patient=None):
        self._tables = {
            "clinic_settings": [{"clinic_name": "عيادة الاختبار", "about_text": ""}],
            "branches": [
                {
                    "id": "b1",
                    "name": "الفرع الرئيسي",
                    "address": None,
                    "phone": None,
                    "working_hours_note": None,
                    "timezone": "Asia/Amman",
                }
            ],
            "services": [],
            "patients": [patient] if patient else [],
        }

    def table(self, name):
        return _Query(list(self._tables.get(name, [])))


def _prompt(photo_description=None, photo_kind=None, image_without_medical_description=False):
    return _build_system_prompt(
        _Db(),
        "b1",
        {},
        patient_id=None,
        photo_description=photo_description,
        image_without_medical_description=image_without_medical_description,
        photo_kind=photo_kind,
    )


def test_no_photo_block_when_nothing_was_sent():
    prompt = _prompt()
    assert "المريض بعت صورة" not in prompt


# --- analysis ---------------------------------------------------------------


def test_analysis_description_is_included_verbatim():
    text = "النوع: بشرة دهنية/مختلطة\nملاحظات:\n- حب الشباب (متوسطة)"
    prompt = _prompt(photo_description=text, photo_kind="analysis")
    assert text in prompt


def test_analysis_block_forbids_inventing_a_diagnosis():
    prompt = _prompt(photo_description="النوع: بشرة دهنية", photo_kind="analysis")
    assert "ممنوع تضيفي اسم مرض أو تشخيص من عندك" in prompt


def test_analysis_block_requires_real_services_from_list_services():
    prompt = _prompt(photo_description="النوع: بشرة دهنية", photo_kind="analysis")
    assert "list_services" in prompt
    assert "ممنوع نهائياً تقترحي اسم خدمة مش راجع فعلاً من list_services" in prompt


def test_analysis_block_ends_with_the_not_a_diagnosis_disclaimer_and_booking_offer():
    prompt = _prompt(photo_description="النوع: بشرة دهنية", photo_kind="analysis")
    assert "تحليل أولي استرشادي مش تشخيص طبي دقيق" in prompt
    assert "تحجزيله موعد" in prompt


def test_analysis_block_specifies_the_reference_card_sections_and_emoji():
    # Matches a reference bot's photo-analysis format the clinic asked to
    # replicate: type/status, a bulleted notes section, matched real
    # services, a short personal note, then a disclaimer + specialist
    # referral -- each section keyed to a fixed emoji, not left to the
    # model's own formatting judgment.
    prompt = _prompt(photo_description="النوع: بشرة دهنية", photo_kind="analysis")
    assert "🔹 *النوع:*" in prompt
    assert "🔹 *الحالة العامة:*" in prompt
    assert "📋 *الملاحظات:*" in prompt
    assert "✨ *خدمات مناسبة لك:*" in prompt
    assert "👤 للتشخيص الدقيق" in prompt


# --- urgent -------------------------------------------------------------


def test_urgent_block_pushes_toward_real_medical_care():
    prompt = _prompt(photo_description="صورة يد فيها احمرار وتقشّر واسع", photo_kind="urgent")
    assert "أقرب طوارئ" in prompt
    assert "escalation_category='medical'" in prompt


def test_urgent_block_still_forbids_naming_a_condition():
    prompt = _prompt(photo_description="صورة يد فيها احمرار وتقشّر واسع", photo_kind="urgent")
    assert "ممنوع نهائياً تسمي أي مرض أو حالة طبية محددة بالاسم" in prompt


def test_urgent_never_shows_the_routine_analysis_card_layout():
    # An urgent photo must never fall into the full "type/status card" the
    # analysis branch uses -- that would read as the clinic treating an
    # emergency as routine business, even though (per a later product
    # decision) it's now allowed to mention real follow-up services below
    # the emergency advice.
    prompt = _prompt(photo_description="صورة يد فيها احمرار وتقشّر واسع", photo_kind="urgent")
    assert "🔹 *النوع:*" not in prompt


def test_urgent_block_may_suggest_real_follow_up_services_after_the_emergency_advice():
    # Product decision: an urgent photo should still point at real services
    # for later follow-up (e.g. burn care) -- but only after the emergency
    # advice, framed explicitly as not a substitute for it, and only from
    # list_services (never invented).
    prompt = _prompt(photo_description="صورة يد فيها احمرار وتقشّر واسع", photo_kind="urgent")
    assert "أقرب طوارئ" in prompt
    assert "بعد نصيحة الطوارئ مباشرة" in prompt
    assert "list_services" in prompt
    assert "مش بديل عن الطوارئ" in prompt


# --- receipt-candidate (not medical/cosmetic at all) -------------------------


def test_no_receipt_hint_when_nothing_was_sent():
    prompt = _prompt(image_without_medical_description=False)
    assert "submit_payment_receipt" not in prompt


def test_receipt_hint_appears_when_photo_is_not_medical():
    prompt = _prompt(image_without_medical_description=True)
    assert "submit_payment_receipt" in prompt
    assert "ممنوع منعاً باتاً تقولي للمريض إن صورته" in prompt


def test_an_unclear_photo_asks_the_patient_instead_of_guessing():
    # "none" now means genuinely unidentified -- a receipt has its own
    # class -- so the fallback here is to ask, not to narrate a guess.
    prompt = _prompt(image_without_medical_description=True)
    assert "اسأليه بشكل طبيعي وودّي شو بيحب تشوفي بالصورة" in prompt


# --- receipt (its own classification, not a flavour of "none") ---------------


def test_a_receipt_photo_goes_straight_to_submit_payment_receipt():
    prompt = _prompt(photo_kind="receipt")
    assert "إثبات دفع" in prompt
    assert "استدعي submit_payment_receipt مباشرة" in prompt


def test_a_receipt_photo_never_gets_the_medical_analysis_treatment():
    # Only the photo block is checked here -- "go to the emergency room"
    # also appears in the general escalation rules, which every prompt
    # carries regardless of what was sent.
    prompt = _prompt(photo_kind="receipt")
    assert "🔹 *النوع:*" not in prompt
    assert "هاي صورة تبدو حالة تحتاج عناية طبية عاجلة" not in prompt


def test_a_receipt_the_clinic_has_no_pending_payment_for_is_not_called_rejected():
    # An unmatched receipt means we couldn't find a payment waiting on it,
    # not that the patient's payment failed -- telling them it was rejected
    # would be alarming and wrong.
    prompt = _prompt(photo_kind="receipt")
    assert "لا تقوليله إن الإيصال انرفض" in prompt


def test_the_bot_never_reads_amounts_off_a_receipt_itself():
    # Amount/reference matching is submit_payment_receipt's job against the
    # real payment row; a number read off the image by a vision model and
    # repeated to the patient would read as the clinic confirming it.
    prompt = _prompt(photo_kind="receipt")
    assert "ممنوع نهائياً تحاولي تقري مبلغ أو رقم عملية من الصورة" in prompt


def test_receipt_hint_is_suppressed_when_photo_is_analysis_even_if_flag_is_set():
    # image_without_medical_description should never be True alongside a real
    # photo_description/photo_kind in practice (they come from the same
    # classification), but the analysis block must win if it ever happens --
    # a photo that IS medical must never be treated as a receipt candidate.
    prompt = _prompt(
        photo_description="النوع: بشرة دهنية",
        photo_kind="analysis",
        image_without_medical_description=True,
    )
    # The receipt-handling block (which instructs *calling* the tool) must
    # not appear; a separate line forbidding the tool by name is expected
    # and is not the same thing -- see test_analysis_and_urgent_forbid_the_receipt_tool.
    assert "استدعي submit_payment_receipt مباشرة" not in prompt


def test_receipt_hint_is_suppressed_when_photo_is_urgent_even_if_flag_is_set():
    prompt = _prompt(
        photo_description="صورة يد فيها احمرار وتقشّر واسع",
        photo_kind="urgent",
        image_without_medical_description=True,
    )
    assert "استدعي submit_payment_receipt مباشرة" not in prompt
