"""A reschedule chain had no end -- clinic_settings.max_reschedules_allowed
lets a clinic cap how many times one appointment can be pushed back, and
reschedule_count (copied forward on every reschedule) is what the cap is
checked against, without walking the previous_appointment_id chain by hand.
"""

import sys
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi import HTTPException  # noqa: E402
import pytest  # noqa: E402

from app.services.scheduling import reschedule_appointment  # noqa: E402
from tests.fake_supabase import FakeSupabase  # noqa: E402

APPT = "appt-1"
BRANCH = "branch-1"
STAFF = "staff-1"


def _db(*, reschedule_count: int = 0, max_allowed: int | None = None) -> FakeSupabase:
    return FakeSupabase(
        {
            "appointments": [
                {
                    "id": APPT,
                    "branch_id": BRANCH,
                    "status": "confirmed",
                    "patient_id": "p1",
                    "staff_id": STAFF,
                    "service_id": None,
                    "slot_id": None,
                    "scheduled_at": "2026-08-10T09:00:00+00:00",
                    "appointment_number": "A-1",
                    "reschedule_count": reschedule_count,
                    "reason_for_visit": None,
                    "priority": None,
                    "source": "dashboard",
                    "notes": None,
                    "guardian_id": None,
                }
            ],
            "slots": [
                {
                    "id": "slot-new",
                    "branch_id": BRANCH,
                    "doctor_id": STAFF,
                    "service_id": None,
                    "start_at": "2026-08-12T09:00:00+00:00",
                    "duration_minutes": 30,
                    "status": "available",
                    "held_by_session": None,
                }
            ],
            "status_transitions": [{"from_status": "confirmed", "to_status": "rescheduled"}],
            "appointment_status_history": [],
            "notification_schedules": [],
            "conversations": [],
            "clinic_settings": [{"max_reschedules_allowed": max_allowed}],
            "queue_tickets": [],
        }
    )


@patch("app.services.appointments.fire_status_change_notifications")
def test_no_configured_limit_allows_unlimited_reschedules(_no_notify):
    db = _db(reschedule_count=11, max_allowed=None)
    new_appt = reschedule_appointment(db, APPT, "slot-new", "sess-1", "الطبيب تأخر", STAFF)
    assert new_appt["reschedule_count"] == 12


@patch("app.services.appointments.fire_status_change_notifications")
def test_reaching_the_limit_blocks_a_further_reschedule(_no_notify):
    db = _db(reschedule_count=3, max_allowed=3)
    with pytest.raises(HTTPException) as exc:
        reschedule_appointment(db, APPT, "slot-new", "sess-1", "الطبيب تأخر", STAFF)
    assert exc.value.status_code == 409

    # Rejected before touching the new slot -- it must stay available for
    # someone else, not get silently held by a reschedule that never happens.
    slot = db._tables["slots"][0]
    assert slot["status"] == "available"


@patch("app.services.appointments.fire_status_change_notifications")
def test_below_the_limit_still_succeeds_and_increments(_no_notify):
    db = _db(reschedule_count=2, max_allowed=3)
    new_appt = reschedule_appointment(db, APPT, "slot-new", "sess-1", "الطبيب تأخر", STAFF)
    assert new_appt["reschedule_count"] == 3
