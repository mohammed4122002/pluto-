"""Name and phone the AI is allowed to write into a patient record.

The chatbot used to store whatever it was handed. Live records show what
that produced: a patient saved as just "مريم", and the phone "00800080" --
eight digits, not a number anyone can be reached on. A booking is worthless
if the clinic can't identify or call the person, so this is enforced in the
tool itself, not only asked for in the prompt: a model that forgets an
instruction still cannot write junk into a medical record.
"""

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.booking import BookingError, validate_full_name, validate_phone  # noqa: E402


@pytest.mark.parametrize(
    "name",
    [
        "كرم محمد الاحمدي",
        "تالا وليد صفدي",
        "  محمد   سعادة   الخطيب  ",
        "عبد الرحمن ياسر النابلسي",
    ],
)
def test_accepts_a_triple_name(name):
    assert validate_full_name(name).count(" ") >= 2


@pytest.mark.parametrize("name", ["كرم", "مريم", "كرم الاحمدي", "", "   "])
def test_rejects_anything_short_of_three_parts(name):
    # "مريم" and "كرم الاحمدي" are both real rows in the live patients table.
    with pytest.raises(BookingError):
        validate_full_name(name)


def test_collapses_stray_whitespace_rather_than_counting_it_as_a_name_part():
    assert validate_full_name("كرم   محمد    الاحمدي") == "كرم محمد الاحمدي"


@pytest.mark.parametrize("name", ["كرم 0791234567", "0791234567", "كرم محمد 123"])
def test_rejects_a_name_containing_digits(name):
    # The model was handed the phone again when a patient sent both on one
    # line, and would happily store the number as the name.
    with pytest.raises(BookingError):
        validate_full_name(name)


def test_single_letter_fragments_do_not_count_toward_the_three_parts():
    with pytest.raises(BookingError):
        validate_full_name("كرم ا ب")


@pytest.mark.parametrize(
    "phone",
    [
        "0791234567",
        "+962791234567",
        "+970595950022",
        "01050181255",
        "079 123 4567",
        "(079) 123-4567",
    ],
)
def test_accepts_plausible_numbers_including_non_jordanian(phone):
    # Live records already include Egyptian and Palestinian numbers --
    # rejecting a real patient is worse than accepting a foreign format.
    assert validate_phone(phone) == phone


@pytest.mark.parametrize(
    "phone",
    [
        "00800080",
        "123",
        "",
        "tg:12345",
        "لا يوجد",
        "0000000000",
        "1234567890123456789",
    ],
)
def test_rejects_what_cannot_be_a_phone_number(phone):
    # "00800080" is a real value that reached the live patients table.
    with pytest.raises(BookingError):
        validate_phone(phone)


def test_keeps_the_number_exactly_as_the_patient_typed_it():
    # Not normalised on purpose: dedup matches on the stored string, so
    # rewriting new numbers into +962 form while existing rows are still
    # 07... would quietly stop matching the same person.
    assert validate_phone("0791234567") == "0791234567"
    assert validate_phone("+962791234567") == "+962791234567"


def test_prompt_no_longer_caps_options_at_two_or_three():
    """The assistant named four services when twelve were active. The cause
    was in the prompt itself -- a style rule that said to show "2-3 كحد
    أقصى" of whatever a tool returned, which is correct for doctors but
    silently truncated the price list a patient asked to see."""
    from app.routers.chat import BASE_INSTRUCTIONS

    assert "2-3 كحد أقصى" not in BASE_INSTRUCTIONS
    assert "كل الأوقات" in BASE_INSTRUCTIONS
    assert "كل الخدمات" in BASE_INSTRUCTIONS


def test_prompt_has_no_unsubstituted_placeholders():
    # BASE_INSTRUCTIONS is concatenated, never .format()ed, so a stray
    # "{name}" would be shown to the patient verbatim.
    import re

    from app.routers.chat import BASE_INSTRUCTIONS

    assert not re.search(r"\{[a-z_]+\}", BASE_INSTRUCTIONS)


def test_list_services_is_exposed_as_a_tool():
    from app.routers.chat import TOOLS

    assert "list_services" in [t["function"]["name"] for t in TOOLS if t.get("function")]


# --- Who still counts as unidentified -------------------------------------
# WhatsApp supplies a real phone number alongside the display name, so a
# patient arriving as "Sami" cleared both placeholder checks and could book
# without ever being asked for the triple name. The gate existed; nothing
# reached it.

from app.services.booking import looks_like_a_full_name, _is_placeholder_name  # noqa: E402


def test_a_channel_display_name_is_not_a_collected_name():
    assert _is_placeholder_name("Sami", "+962790000001") is True
    assert _is_placeholder_name("سامي خالد", "+962790000001") is True


def test_a_real_triple_name_passes():
    assert _is_placeholder_name("سامي خالد النجار", "+962790000001") is False


def test_the_old_placeholder_forms_still_count():
    assert _is_placeholder_name(None, None) is True
    assert _is_placeholder_name("tg:12345", "tg:12345") is True
    assert _is_placeholder_name("+962790000001", "+962790000001") is True


def test_a_name_carrying_digits_is_not_a_name():
    # The phone pasted into the name field was a real failure mode.
    assert looks_like_a_full_name("سامي 0790000001 خالد") is False


def test_single_letter_fragments_do_not_pad_a_name():
    assert looks_like_a_full_name("سامي خ النجار") is False


# --- A name has to have been said -----------------------------------------
# Requiring three parts by shape alone rewarded inventing one: asked to
# complete "سامي خالد", the live assistant saved "سامي خالد الأحمد" -- a family
# name nobody had said, onto a medical record.

from app.services.booking import BookingError, validate_full_name  # noqa: E402
import pytest as _pytest  # noqa: E402


def test_a_part_the_patient_never_said_is_refused():
    with _pytest.raises(BookingError) as exc:
        validate_full_name("سامي خالد الأحمد", patient_said="اسمي سامي خالد ورقمي 0791234567")
    assert "الأحمد" in str(exc.value)


def test_a_name_the_patient_did_say_is_accepted():
    assert validate_full_name(
        "سامي خالد الأحمد", patient_said="اسمي سامي خالد الأحمد ورقمي 0791234567"
    ) == "سامي خالد الأحمد"


def test_hamza_and_alef_spellings_still_match():
    # The patient types "الاحمد", the model writes back "الأحمد".
    assert validate_full_name(
        "سامي خالد الأحمد", patient_said="انا سامي خالد الاحمد"
    ) == "سامي خالد الأحمد"


def test_without_the_patient_text_the_shape_check_still_applies():
    # Callers that cannot supply the transcript keep the old behaviour.
    assert validate_full_name("سامي خالد الأحمد") == "سامي خالد الأحمد"
    with _pytest.raises(BookingError):
        validate_full_name("سامي خالد")
