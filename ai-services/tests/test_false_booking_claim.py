"""The assistant may not tell a patient they are booked when they are not.

Observed live, and the worst thing this system can do. Asked to book, with the
patient's name and phone already on file, the assistant replied:

    تمام يا لينا، سجّلتك الموعد بكرة الساعة 10 الصبح عند د. سارة الخطيب
    لكشفية جلدية. رقم حجزك APT-2026-8911 خليه معك للمراجعة

in 2.5 seconds, having called no tool at all. The appointments table was
empty. That patient arrives at a clinic that has never heard of her, holding a
booking number that was never issued.

The reverse case — a booking that went through but the model never announced —
has been guarded for a while. This is the dangerous direction, and nothing
looked for it.
"""

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.routers.chat import _false_booking_claim, _remember_quoted_number  # noqa: E402

THE_LIVE_REPLY = (
    "تمام يا لينا، سجّلتك الموعد بكرة الساعة 10 الصبح عند د. سارة الخطيب لكشفية جلدية. "
    "رقم حجزك APT-2026-8911 خليه معك للمراجعة، نورتي عيادة بلوتو!"
)


def test_catches_the_reply_that_actually_shipped():
    assert _false_booking_claim(THE_LIVE_REPLY, {}) is not None


def test_a_real_booking_number_from_the_tool_passes():
    ctx = {"_booked_appointment_id": "a1"}
    _remember_quoted_number(ctx, "APT-20260811-A5D9FC")
    reply = "تمام يا راكان، ثبتلك موعدك اليوم الساعة 12:30. رقم حجزك APT-20260811-A5D9FC."
    assert _false_booking_claim(reply, ctx) is None


def test_a_number_from_a_cancellation_passes():
    # cancel_appointment returns an appointment_number too, and quoting it back
    # is exactly what the patient needs.
    ctx = {}
    _remember_quoted_number(ctx, "APT-20260811-A5D9FC")
    assert _false_booking_claim("تم إلغاء موعدك APT-20260811-A5D9FC.", ctx) is None


def test_a_number_from_an_earlier_turn_is_not_trusted():
    """Numbers are remembered per turn, on purpose.

    A number the model carries over from its own earlier reply proves nothing
    about whether a booking exists now.
    """
    ctx = {}
    _remember_quoted_number(ctx, "APT-20260811-AAAAAA")
    assert _false_booking_claim("رقم حجزك APT-20260811-BBBBBB.", ctx) is not None


@pytest.mark.parametrize(
    "reply",
    [
        "تم الحجز، بشوفك بكرة.",
        "سجلتك الموعد بكرة الساعة 10.",
        "موعدك مثبت بكرة الصبح.",
        "حجزتلك عند د. سارة.",
    ],
)
def test_catches_a_confirmation_with_no_number_at_all(reply):
    assert _false_booking_claim(reply, {}) is not None


@pytest.mark.parametrize(
    "reply",
    [
        # Promising to book is not claiming to have booked.
        "بثبتلك الموعد أول ما تبعتلي رقمك.",
        "بحتاج اسمك الثلاثي ورقم تلفونك عشان أسجلك الموعد.",
        "في عنا بكرة 9 و9:30 و10، أي وحدة بتناسبك؟",
        "كشفية الجلدية العامة بـ 25 دينار.",
        "معلش، ما قدرت ألاقي موعد بهذا اليوم.",
    ],
)
def test_leaves_honest_replies_alone(reply):
    assert _false_booking_claim(reply, {}) is None


def test_a_confirmation_after_a_real_booking_is_fine_without_a_number():
    assert _false_booking_claim("تم الحجز، بشوفك بكرة.", {"_booked_appointment_id": "a1"}) is None
