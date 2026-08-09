"""Why a slot-generation run produced nothing.

Three different causes all returned a bare 0, so from the dashboard they
were indistinguishable -- and the calendar just reloaded unchanged. That is
how "generating slots does nothing" became the reported symptom instead of
"this doctor has no schedule yet", which is what it actually was for 25 of
the 26 doctors in the live database.
"""

import sys
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.slots import (  # noqa: E402
    INACTIVE_DOCTOR,
    NO_AVAILABILITY,
    NO_WORKING_DAYS,
    generate_slots_for_doctor,
)
from tests.fake_supabase import FakeSupabase  # noqa: E402

DOCTOR = "doc-1"
BRANCH = "branch-1"
TODAY = date(2026, 8, 10)  # a Monday
NEXT_WEEK = TODAY + timedelta(days=6)


def _db(*, active: bool = True, availability: list[dict] | None = None) -> FakeSupabase:
    return FakeSupabase(
        {
            "staff": [{"id": DOCTOR, "is_active": active}],
            "doctor_availability": availability if availability is not None else [],
            "branches": [{"id": BRANCH, "timezone": "Asia/Amman"}],
            "doctor_leaves": [],
            "branch_holidays": [],
            "doctor_limits": [],
            "slots": [],
        }
    )


def _availability(day_of_week: int) -> dict:
    return {
        "staff_id": DOCTOR,
        "branch_id": BRANCH,
        "day_of_week": day_of_week,
        "start_time": "09:00:00",
        "end_time": "12:00:00",
        "slot_duration_minutes": 30,
        "is_active": True,
    }


def test_no_schedule_says_so_instead_of_a_bare_zero():
    # The live case: 25 of 26 doctors have no doctor_availability rows.
    created, reason = generate_slots_for_doctor(_db(), DOCTOR, BRANCH, TODAY, NEXT_WEEK)
    assert (created, reason) == (0, NO_AVAILABILITY)


def test_a_deactivated_doctor_is_reported_as_such():
    db = _db(active=False, availability=[_availability(1)])
    created, reason = generate_slots_for_doctor(db, DOCTOR, BRANCH, TODAY, NEXT_WEEK)
    assert (created, reason) == (0, INACTIVE_DOCTOR)


def test_a_range_with_no_working_day_in_it_is_reported_separately():
    # Doctor only works Fridays; the range is a single Monday.
    db = _db(availability=[_availability(5)])
    created, reason = generate_slots_for_doctor(db, DOCTOR, BRANCH, TODAY, TODAY)
    assert (created, reason) == (0, NO_WORKING_DAYS)


def test_a_successful_run_reports_no_reason():
    db = _db(availability=[_availability(d) for d in range(0, 7)])
    created, reason = generate_slots_for_doctor(db, DOCTOR, BRANCH, TODAY, TODAY)
    assert created > 0
    assert reason is None
