"""Which day a slot is on, and which day a filter means.

Live failure: the assistant offered "اليوم الساعة 4 أو 4:30، أو بكرة الساعة 9
و9:30…", the patient answered "تمام ع 4ونص", and the reply was that 4:30 was
not available today — followed by tomorrow's times only. The 4:30 slot was
available in the table the whole time, and so was 4:00.

Two things made that possible: the model had to work out "today"/"tomorrow"
itself from ISO strings, and every bound it wrote back was compared against
UTC even though every time it had been shown was clinic-local.
"""

import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.booking import _as_utc_bound, _day_label  # noqa: E402

AMMAN = ZoneInfo("Asia/Amman")


def test_a_bare_date_means_midnight_clinic_time_not_midnight_utc():
    # 2026-08-10 in Amman starts at 21:00 UTC the previous day. Read as UTC,
    # the window is shifted three hours and slides off the end of the day.
    assert _as_utc_bound("2026-08-10", AMMAN) == "2026-08-09T21:00:00+00:00"


def test_a_local_wall_time_is_read_in_the_clinics_timezone():
    assert _as_utc_bound("2026-08-10T16:30:00", AMMAN) == "2026-08-10T13:30:00+00:00"


def test_an_explicit_offset_is_respected_as_written():
    assert _as_utc_bound("2026-08-10T16:30:00+03:00", AMMAN) == "2026-08-10T13:30:00+00:00"
    assert _as_utc_bound("2026-08-10T13:30:00+00:00", AMMAN) == "2026-08-10T13:30:00+00:00"


def test_end_of_the_working_day_stays_in_the_same_day():
    """The case that actually broke: a 4:30pm slot, filtered by 'today'."""
    start = _as_utc_bound("2026-08-10T00:00:00", AMMAN)
    end = _as_utc_bound("2026-08-10T23:59:59", AMMAN)
    slot = datetime(2026, 8, 10, 13, 30, tzinfo=timezone.utc).isoformat()  # 16:30 Amman
    assert start < slot < end


@pytest.mark.parametrize("value", [None, ""])
def test_no_bound_stays_no_bound(value):
    assert _as_utc_bound(value, AMMAN) is None


def test_an_unparseable_bound_is_passed_through_rather_than_raising():
    # Dropping a booking mid-conversation over a malformed filter is worse
    # than ignoring the filter.
    assert _as_utc_bound("بكرة", AMMAN) == "بكرة"


def _label(days_ahead, hour=16):
    now = datetime(2026, 8, 10, 15, 33, tzinfo=AMMAN)
    return _day_label(now.replace(hour=hour, minute=0) + timedelta(days=days_ahead), now)


def test_the_model_is_told_the_day_in_words():
    assert _label(0) == "اليوم"
    assert _label(1) == "بكرة"


def test_further_out_is_named_by_weekday_and_date():
    # No relative wording past tomorrow: "بعد بكرة" is where a patient and a
    # receptionist start disagreeing about which day they mean.
    assert _label(2) == "الأربعاء 2026-08-12"


def test_the_day_flips_by_calendar_date_not_by_elapsed_hours():
    now = datetime(2026, 8, 10, 23, 30, tzinfo=AMMAN)
    just_after_midnight = datetime(2026, 8, 11, 0, 30, tzinfo=AMMAN)
    assert _day_label(just_after_midnight, now) == "بكرة"
