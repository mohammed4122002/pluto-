"""The photo-description block _build_system_prompt injects when a patient's
most recent message carried an image.

The one rule this must never violate: the model reading this prompt is a
booking assistant, not a doctor, and nothing here may read as permission to
name a condition or diagnose from what the photo shows.
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


def _no_patient_prompt(photo_description=None):
    return _build_system_prompt(_Db(), "b1", {}, patient_id=None, photo_description=photo_description)


def test_no_photo_block_when_nothing_was_sent():
    prompt = _no_patient_prompt(photo_description=None)
    assert "المريض بعت صورة" not in prompt


def test_photo_description_is_included_verbatim():
    prompt = _no_patient_prompt(photo_description="صورة وجه فيها احمرار وحبوب صغيرة متفرقة على الخدين")
    assert "صورة وجه فيها احمرار وحبوب صغيرة متفرقة على الخدين" in prompt


def test_photo_block_forbids_diagnosis():
    prompt = _no_patient_prompt(photo_description="صورة يد فيها انتفاخ خفيف عند المفصل")
    assert "ممنوع نهائياً تسمي أي مرض أو حالة طبية بالاسم" in prompt
    assert "موظفة استقبال مش طبيبة" in prompt


def test_photo_block_directs_to_service_suggestion_not_diagnosis():
    prompt = _no_patient_prompt(photo_description="صورة وجه فيها احمرار")
    assert "لتقترحي أنسب خدمة" in prompt
    assert "لازم يحجز عشان الطبيب يشوفها عن قرب" in prompt


def test_no_receipt_hint_when_nothing_was_sent():
    prompt = _build_system_prompt(
        _Db(), "b1", {}, patient_id=None, photo_description=None, image_without_medical_description=False
    )
    assert "submit_payment_receipt" not in prompt


def test_receipt_hint_appears_when_photo_is_not_medical():
    prompt = _build_system_prompt(
        _Db(), "b1", {}, patient_id=None, photo_description=None, image_without_medical_description=True
    )
    assert "submit_payment_receipt" in prompt
    assert "لا تفترضي إنها إيصال دفع من عندك" in prompt


def test_receipt_hint_is_suppressed_when_photo_is_medical_even_if_flag_is_set():
    # image_without_medical_description should never be True alongside a real
    # photo_description in practice (they come from the same classification),
    # but the medical block must win if it ever happens -- a photo that IS
    # medical must never be treated as a receipt candidate.
    prompt = _build_system_prompt(
        _Db(),
        "b1",
        {},
        patient_id=None,
        photo_description="صورة يد فيها انتفاخ خفيف عند المفصل",
        image_without_medical_description=True,
    )
    assert "submit_payment_receipt" not in prompt
