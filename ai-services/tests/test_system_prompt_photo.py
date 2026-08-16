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


# --- urgent -------------------------------------------------------------


def test_urgent_block_pushes_toward_real_medical_care():
    prompt = _prompt(photo_description="صورة يد فيها احمرار وتقشّر واسع", photo_kind="urgent")
    assert "أقرب طوارئ" in prompt
    assert "escalation_category='medical'" in prompt


def test_urgent_block_still_forbids_naming_a_condition():
    prompt = _prompt(photo_description="صورة يد فيها احمرار وتقشّر واسع", photo_kind="urgent")
    assert "ممنوع نهائياً تسمي أي مرض أو حالة طبية محددة بالاسم" in prompt


def test_urgent_never_offers_the_routine_analysis_card():
    # An urgent photo must never fall into the "here's a nice card + book a
    # service" treatment -- that would read as the clinic treating an
    # emergency as routine upsell.
    prompt = _prompt(photo_description="صورة يد فيها احمرار وتقشّر واسع", photo_kind="urgent")
    assert "اقترحي عليه 2-3 خدمات حقيقية" not in prompt


# --- receipt-candidate (not medical/cosmetic at all) -------------------------


def test_no_receipt_hint_when_nothing_was_sent():
    prompt = _prompt(image_without_medical_description=False)
    assert "submit_payment_receipt" not in prompt


def test_receipt_hint_appears_when_photo_is_not_medical():
    prompt = _prompt(image_without_medical_description=True)
    assert "submit_payment_receipt" in prompt
    assert "لا تفترضي إنها إيصال دفع من عندك" in prompt


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
    assert "submit_payment_receipt" not in prompt


def test_receipt_hint_is_suppressed_when_photo_is_urgent_even_if_flag_is_set():
    prompt = _prompt(
        photo_description="صورة يد فيها احمرار وتقشّر واسع",
        photo_kind="urgent",
        image_without_medical_description=True,
    )
    assert "submit_payment_receipt" not in prompt
