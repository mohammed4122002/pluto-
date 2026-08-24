"""Registering a substitute has to change what a doctor's absence does.

handle_doctor_absence has always had a full reassign-to-a-covering-doctor
path, but doctor_substitutes had no write path anywhere -- so the table was
permanently empty, _find_substitute always returned None, and every absence
fell straight through to cancelling all of that doctor's patients. The code
to move them existed and worked; nothing could ever reach it.

The first test here is the one that matters: same absence, same appointments,
and the only difference is whether a substitute is on file.
"""

import sys
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi import HTTPException  # noqa: E402
import pytest  # noqa: E402

from app.services.scheduling import _find_substitute, handle_doctor_absence  # noqa: E402
from tests.fake_supabase import FakeSupabase  # noqa: E402

BRANCH = "branch-1"
OTHER_BRANCH = "branch-2"
ABSENT = "doc-absent"
COVER = "doc-cover"
APPT = "appt-1"
FROM = "2026-09-10T00:00:00+00:00"
TO = "2026-09-11T00:00:00+00:00"
AT = "2026-09-10T09:00:00+00:00"


def _db(substitutes: list[dict], *, cover_has_slot: bool = True) -> FakeSupabase:
    return FakeSupabase({
        "appointments": [{
            "id": APPT, "branch_id": BRANCH, "patient_id": "p1", "staff_id": ABSENT,
            "service_id": None, "slot_id": "slot-old", "scheduled_at": AT,
            "duration_minutes": 30, "notes": None, "status": "confirmed",
        }],
        "doctor_substitutes": substitutes,
        "slots": (
            [{"id": "slot-cover", "branch_id": BRANCH, "doctor_id": COVER,
              "start_at": AT, "status": "available"}] if cover_has_slot else []
        ) + [{"id": "slot-old", "branch_id": BRANCH, "doctor_id": ABSENT,
              "start_at": AT, "status": "booked"}],
        "status_transitions": [
            {"from_status": "confirmed", "to_status": "rescheduled"},
            {"from_status": "confirmed", "to_status": "cancelled_by_doctor"},
        ],
        "appointment_status_history": [],
        "notification_schedules": [],
        "conversations": [],
        "queue_tickets": [],
        "waitlist": [],
        "staff": [
            {"id": ABSENT, "is_active": True, "role": "doctor"},
            {"id": COVER, "is_active": True, "role": "doctor"},
        ],
    })


def _cover(branch_id: str | None = BRANCH) -> dict:
    return {"id": "sub-1", "staff_id": ABSENT, "substitute_staff_id": COVER,
            "branch_id": branch_id, "start_at": FROM, "end_at": TO}


@patch("app.services.appointments.fire_status_change_notifications")
def test_without_a_substitute_an_absence_cancels_every_patient(_no_notify):
    # The live behaviour before this existed -- and the baseline the next
    # test is measured against.
    db = _db(substitutes=[])
    result = handle_doctor_absence(db, ABSENT, BRANCH, FROM, TO, "الطبيب مريض", None)
    assert result["cancelled_count"] == 1
    assert result["reassigned_count"] == 0
    assert result["substitute_staff_id"] is None


@patch("app.services.appointments.fire_status_change_notifications")
def test_with_a_substitute_on_file_the_patient_is_moved_instead(_no_notify):
    db = _db(substitutes=[_cover()])
    result = handle_doctor_absence(db, ABSENT, BRANCH, FROM, TO, "الطبيب مريض", None)
    assert result["reassigned_count"] == 1
    assert result["cancelled_count"] == 0
    assert result["substitute_staff_id"] == COVER


@patch("app.services.appointments.fire_status_change_notifications")
def test_a_substitute_with_no_open_slot_still_falls_back_to_cancelling(_no_notify):
    # Registering cover is not a promise the cover is free -- the patient must
    # not be silently left on an absent doctor's calendar.
    db = _db(substitutes=[_cover()], cover_has_slot=False)
    result = handle_doctor_absence(db, ABSENT, BRANCH, FROM, TO, "الطبيب مريض", None)
    assert result["cancelled_count"] == 1
    assert result["reassigned_count"] == 0


def test_a_substitute_for_another_branch_does_not_cover_this_one():
    db = _db(substitutes=[_cover(branch_id=OTHER_BRANCH)])
    assert _find_substitute(db, ABSENT, BRANCH, FROM, TO) is None


def test_a_branch_wide_arrangement_covers_any_branch():
    db = _db(substitutes=[_cover(branch_id=None)])
    assert _find_substitute(db, ABSENT, BRANCH, FROM, TO) == COVER


def test_a_branch_specific_arrangement_wins_over_a_branch_wide_one():
    db = _db(substitutes=[
        {**_cover(branch_id=None), "id": "sub-wide", "substitute_staff_id": "doc-generic"},
        _cover(branch_id=BRANCH),
    ])
    assert _find_substitute(db, ABSENT, BRANCH, FROM, TO) == COVER


def test_an_arrangement_outside_the_absence_window_does_not_apply():
    db = _db(substitutes=[{**_cover(), "start_at": "2026-10-01T00:00:00+00:00",
                           "end_at": "2026-10-02T00:00:00+00:00"}])
    assert _find_substitute(db, ABSENT, BRANCH, FROM, TO) is None


# --- the API guards ---------------------------------------------------------


def test_a_doctor_cannot_be_registered_as_their_own_substitute():
    from app.models.schemas import DoctorSubstituteCreate
    from app.routers.doctor_cover import create_substitute

    payload = DoctorSubstituteCreate(
        staff_id="11111111-1111-1111-1111-111111111111",
        substitute_staff_id="11111111-1111-1111-1111-111111111111",
        branch_id=None, start_at=FROM, end_at=TO,
    )
    with pytest.raises(HTTPException) as exc:
        create_substitute(payload, current=None, db=_db([]))
    assert exc.value.status_code == 400


def test_a_backwards_cover_window_is_rejected():
    from app.models.schemas import DoctorSubstituteCreate
    from app.routers.doctor_cover import create_substitute

    payload = DoctorSubstituteCreate(
        staff_id="11111111-1111-1111-1111-111111111111",
        substitute_staff_id="22222222-2222-2222-2222-222222222222",
        branch_id=None, start_at=TO, end_at=FROM,
    )
    with pytest.raises(HTTPException) as exc:
        create_substitute(payload, current=None, db=_db([]))
    assert exc.value.status_code == 400


# --- per-doctor limits ------------------------------------------------------

STAFF_UUID = "33333333-3333-3333-3333-333333333333"


def _limits_db(rows: list[dict]) -> FakeSupabase:
    return FakeSupabase({"doctor_limits": rows})


def test_a_doctor_with_no_limits_row_still_gets_an_answer():
    # Most doctors have no row; returning an all-null record instead of a 404
    # is what lets the UI open the same empty form either way.
    from app.routers.doctor_cover import get_limits

    result = get_limits(STAFF_UUID, _current=None, db=_limits_db([]))
    assert str(result.staff_id) == STAFF_UUID
    assert result.buffer_before_minutes is None


def test_setting_limits_the_first_time_creates_the_row():
    from app.models.schemas import DoctorLimitsUpdate
    from app.routers.doctor_cover import set_limits

    db = _limits_db([])
    set_limits(STAFF_UUID, DoctorLimitsUpdate(buffer_before_minutes=10, buffer_after_minutes=5), _current=None, db=db)
    assert len(db._tables["doctor_limits"]) == 1
    assert db._tables["doctor_limits"][0]["buffer_before_minutes"] == 10


def test_setting_limits_again_updates_rather_than_duplicating():
    from app.models.schemas import DoctorLimitsUpdate
    from app.routers.doctor_cover import set_limits

    db = _limits_db([{"staff_id": STAFF_UUID, "buffer_before_minutes": 10}])
    set_limits(STAFF_UUID, DoctorLimitsUpdate(buffer_before_minutes=20), _current=None, db=db)
    assert len(db._tables["doctor_limits"]) == 1
    assert db._tables["doctor_limits"][0]["buffer_before_minutes"] == 20


def test_half_a_break_window_is_rejected():
    # A start with no end would silently disable the break in the generator,
    # which reads both or neither.
    from app.models.schemas import DoctorLimitsUpdate
    from app.routers.doctor_cover import set_limits

    with pytest.raises(HTTPException) as exc:
        set_limits(STAFF_UUID, DoctorLimitsUpdate(break_start_time="13:00"), _current=None, db=_limits_db([]))
    assert exc.value.status_code == 400


def test_a_backwards_break_window_is_rejected():
    from app.models.schemas import DoctorLimitsUpdate
    from app.routers.doctor_cover import set_limits

    with pytest.raises(HTTPException) as exc:
        set_limits(
            STAFF_UUID,
            DoctorLimitsUpdate(break_start_time="15:00", break_end_time="13:00"),
            _current=None, db=_limits_db([]),
        )
    assert exc.value.status_code == 400
