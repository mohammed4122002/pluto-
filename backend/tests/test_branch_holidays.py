"""Declaring a holiday has to close that day's already-open slots.

branch_holidays and the generator's respect for it both shipped in the
original schema, but no write path was ever built -- so the feature was
unreachable. The trap in adding one is that generate_slots_for_doctor only
skips holidays for slots it creates *afterwards*: a holiday declared for a
day that already has slots would be saved, shown in the UI, and change
nothing at all, while patients kept booking straight through it.
"""

import sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.slots import (  # noqa: E402
    block_slots_for_holiday,
    unblock_slots_for_holiday,
)
from tests.fake_supabase import FakeSupabase  # noqa: E402

BRANCH = "branch-1"
OTHER_BRANCH = "branch-2"
HOLIDAY_ID = "holiday-1"
DAY = date(2026, 9, 15)

# Asia/Amman is UTC+3, so the local day starts at 21:00 UTC the evening
# before -- the exact off-by-three-hours this code has to get right.
def _at(local_hour: int, day: date = DAY, minutes: int = 30) -> dict:
    start = datetime(day.year, day.month, day.day, local_hour, 0, tzinfo=timezone(timedelta(hours=3)))
    return {
        "start_at": start.isoformat(),
        "end_at": (start + timedelta(minutes=minutes)).isoformat(),
        "duration_minutes": minutes,
    }


def _slot(slot_id: str, local_hour: int, *, branch: str = BRANCH, status: str = "available",
          day: date = DAY, block_reason: str | None = None) -> dict:
    return {"id": slot_id, "branch_id": branch, "status": status,
            "block_reason": block_reason, **_at(local_hour, day)}


def _db(slots: list[dict]) -> FakeSupabase:
    return FakeSupabase({
        "branches": [{"id": BRANCH, "timezone": "Asia/Amman"},
                     {"id": OTHER_BRANCH, "timezone": "Asia/Amman"}],
        "slots": slots,
    })


def _holiday(is_full_day: bool = True, start_time=None, end_time=None) -> dict:
    return {"holiday_date": DAY.isoformat(), "is_full_day": is_full_day,
            "start_time": start_time, "end_time": end_time}


def _status(db: FakeSupabase, slot_id: str) -> str:
    return next(s for s in db._tables["slots"] if s["id"] == slot_id)["status"]


def test_a_full_day_closure_blocks_every_open_slot_that_day():
    db = _db([_slot("s-morning", 9), _slot("s-afternoon", 15)])
    assert block_slots_for_holiday(db, HOLIDAY_ID, BRANCH, _holiday()) == 2
    assert _status(db, "s-morning") == "blocked"
    assert _status(db, "s-afternoon") == "blocked"


def test_the_next_day_is_untouched():
    # The local-day boundary is the whole point: in Amman the holiday starts
    # at 21:00 UTC the night before, so a naive UTC-midnight window would
    # wrongly catch the following morning.
    db = _db([_slot("s-holiday", 9), _slot("s-next-day", 9, day=DAY + timedelta(days=1))])
    assert block_slots_for_holiday(db, HOLIDAY_ID, BRANCH, _holiday()) == 1
    assert _status(db, "s-holiday") == "blocked"
    assert _status(db, "s-next-day") == "available"


def test_another_branch_stays_open():
    db = _db([_slot("s-here", 9), _slot("s-elsewhere", 9, branch=OTHER_BRANCH)])
    assert block_slots_for_holiday(db, HOLIDAY_ID, BRANCH, _holiday()) == 1
    assert _status(db, "s-elsewhere") == "available"


def test_a_booked_slot_is_never_taken_from_its_patient():
    # That appointment belongs to someone real; cancelling it is reception's
    # call (they may need to phone the patient), not a calendar side effect.
    db = _db([_slot("s-booked", 9, status="booked"), _slot("s-open", 11)])
    assert block_slots_for_holiday(db, HOLIDAY_ID, BRANCH, _holiday()) == 1
    assert _status(db, "s-booked") == "booked"


def test_a_half_day_closure_only_blocks_the_overlapping_hours():
    db = _db([_slot("s-morning", 9), _slot("s-afternoon", 15)])
    blocked = block_slots_for_holiday(
        db, HOLIDAY_ID, BRANCH, _holiday(is_full_day=False, start_time="14:00", end_time="17:00")
    )
    assert blocked == 1
    assert _status(db, "s-morning") == "available"
    assert _status(db, "s-afternoon") == "blocked"


def test_cancelling_the_holiday_reopens_exactly_what_it_closed():
    db = _db([_slot("s-open", 9),
              # Blocked earlier for a doctor's leave -- must stay blocked.
              _slot("s-on-leave", 11, status="blocked", block_reason="leave:xyz")])
    assert block_slots_for_holiday(db, HOLIDAY_ID, BRANCH, _holiday()) == 1

    assert unblock_slots_for_holiday(db, HOLIDAY_ID) == 1
    assert _status(db, "s-open") == "available"
    assert _status(db, "s-on-leave") == "blocked"


def test_reopened_slots_lose_the_holiday_tag():
    db = _db([_slot("s-open", 9)])
    block_slots_for_holiday(db, HOLIDAY_ID, BRANCH, _holiday())
    unblock_slots_for_holiday(db, HOLIDAY_ID)
    assert next(s for s in db._tables["slots"] if s["id"] == "s-open")["block_reason"] is None


def test_a_day_with_nothing_open_is_not_an_error():
    db = _db([_slot("s-next-week", 9, day=DAY + timedelta(days=7))])
    assert block_slots_for_holiday(db, HOLIDAY_ID, BRANCH, _holiday()) == 0
