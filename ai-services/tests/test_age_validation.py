"""Age the AI is allowed to write into a patient record.

Same reasoning as test_contact_validation.py, extended: a service's min_age
gate (backend/app/routers/slots.py) silently no-ops when a patient's
date_of_birth is null -- the state every patient registered through this
chatbot was left in before age collection existed. This is what makes the
gate actually mean something for patients who came in through chat.
"""

import sys
from datetime import date, datetime, timezone
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.booking import BookingError, _date_of_birth_from_age, validate_age  # noqa: E402


@pytest.mark.parametrize("age", [1, 17, 25, 60, 120])
def test_accepts_plausible_ages(age):
    assert validate_age(age) == age


@pytest.mark.parametrize("age", [0, -5, 121, 999])
def test_rejects_implausible_ages(age):
    with pytest.raises(BookingError):
        validate_age(age)


def test_rejects_a_non_integer():
    # The model is instructed to send 0 for "not mentioned" -- anything else
    # non-integer reaching here is not something a patient could have typed
    # as their age.
    with pytest.raises(BookingError):
        validate_age("25")  # type: ignore[arg-type]


def test_rejects_a_bool_even_though_bool_is_an_int_subclass():
    # isinstance(True, int) is True in Python -- without an explicit guard a
    # stray boolean would silently pass as age 1 or 0.
    with pytest.raises(BookingError):
        validate_age(True)  # type: ignore[arg-type]


def test_an_age_the_patient_said_is_accepted():
    assert validate_age(25, patient_said="عمري 25 وبدي احجز") == 25


def test_an_age_the_patient_never_said_is_refused():
    with pytest.raises(BookingError):
        validate_age(25, patient_said="اسمي سامي ورقمي 0791234567")


def test_without_patient_text_the_range_check_still_applies():
    assert validate_age(25) == 25
    with pytest.raises(BookingError):
        validate_age(200)


def test_date_of_birth_from_age_is_roughly_right():
    today = datetime.now(timezone.utc).date()
    dob = date.fromisoformat(_date_of_birth_from_age(25))
    computed_age = (today - dob).days // 365
    assert computed_age == 25


def test_date_of_birth_from_age_never_raises_across_the_whole_plausible_range():
    # Covers the Feb 29 fallback on whichever day this actually runs: if
    # today is Feb 29, at least one of these 120 years back lands on a
    # non-leap year, which is exactly the case the try/except in
    # _date_of_birth_from_age exists for.
    for age in range(1, 121):
        date.fromisoformat(_date_of_birth_from_age(age))  # must not raise
