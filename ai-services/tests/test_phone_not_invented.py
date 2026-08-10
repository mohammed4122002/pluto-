"""A phone number the patient never typed must not reach a medical record.

From a real Telegram booking: the assistant asked for the triple name and the
phone, the patient sent only "علي خالد سعاد", and the appointment was
confirmed anyway with the phone 0791234567 -- the example number that used to
appear inside this module's own validation error text. The model was handed a
plausible-looking number and stored it.

Two things went wrong and both are covered here: the error message offered an
example, and nothing checked the number against what the patient wrote.
"""

import re
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services import booking  # noqa: E402
from app.services.booking import BookingError, validate_phone  # noqa: E402

SAID = "بدي احجز حشوة، رقمي 0791111222"


def test_rejects_a_number_the_patient_never_wrote():
    with pytest.raises(BookingError) as exc:
        validate_phone("0791234567", patient_said=SAID)
    assert "ما كتبه" in str(exc.value)


def test_accepts_the_number_the_patient_wrote():
    assert validate_phone("0791111222", patient_said=SAID) == "0791111222"


@pytest.mark.parametrize(
    "typed,given",
    [
        ("079 111 1222", "0791111222"),  # spaces
        ("079-111-1222", "0791111222"),  # dashes
        ("٠٧٩١١١١٢٢٢", "0791111222"),  # Arabic-Indic digits
        ("رقمي هو 0791111222 شكرا", "0791111222"),
    ],
)
def test_separators_and_arabic_digits_are_not_treated_as_a_different_number(typed, given):
    assert validate_phone(given, patient_said=f"اهلا {typed}") == given


@pytest.mark.parametrize("bad", ["", "abc", "079", "00800080", "0000000000", "tg:12345", "0791234567"])
def test_no_error_the_model_can_see_offers_a_usable_number(bad):
    """The fix is not only the check -- it is not handing the model a number.

    Every one of these strings goes back to the model verbatim as a tool
    error. A run of digits long enough to pass validation is one the model can
    copy into a patient record, which is exactly what happened.
    """
    with pytest.raises(BookingError) as exc:
        validate_phone(bad, patient_said=SAID)
    assert not re.search(r"\d{%d,}" % booking._MIN_PHONE_DIGITS, str(exc.value)), str(exc.value)


def test_still_rejects_junk_even_with_no_history_to_check():
    # patient_said=None keeps the old behaviour for callers that have no
    # history, so the shape checks must still stand on their own.
    for junk in ("00800080", "0000000000", "abc"):
        with pytest.raises(BookingError):
            validate_phone(junk)
