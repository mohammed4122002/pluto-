"""get_due_reminders: the "after_appointment" rating request ("شكراً
لزيارتك اليوم! كيف كانت تجربتك؟") must only fire for a visit the clinic
actually completed, not merely a "confirmed" booking.

Confirmed live 2026-09-16: a booking nobody ever checked in for (patient
never saw a doctor, status stayed "confirmed" the whole time) still got
asked to rate a visit that never happened, once enough time passed after
its scheduled_at. "before_appointment" reminders have the opposite,
correct concern -- an upcoming merely-confirmed booking is exactly what
should be reminded about, so that half is unchanged.
"""

import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.notifications import get_due_reminders  # noqa: E402
from tests.fake_supabase import FakeSupabase  # noqa: E402


def _db(appointment_status: str, trigger_type: str, offset_minutes: int) -> FakeSupabase:
    now = datetime.now(timezone.utc)
    scheduled_at = now - timedelta(minutes=offset_minutes)
    return FakeSupabase(
        {
            "notification_schedules": [
                {
                    "id": "sched-1",
                    "trigger_type": trigger_type,
                    "offset_minutes": offset_minutes,
                    "status_trigger": None,
                    "is_active": True,
                    "template_id": "tmpl-1",
                    "notification_templates": {"id": "tmpl-1", "body_template": "..."},
                }
            ],
            "appointments": [
                {"id": "appt-1", "scheduled_at": scheduled_at.isoformat(), "status": appointment_status}
            ],
            "notification_log": [],
        }
    )


def test_after_appointment_survey_is_not_due_for_a_merely_confirmed_booking():
    # The exact incident: never checked in, never seen by a doctor.
    db = _db("confirmed", "after_appointment", offset_minutes=60)
    assert get_due_reminders(db) == []


def test_after_appointment_survey_is_due_once_the_visit_is_actually_completed():
    db = _db("completed", "after_appointment", offset_minutes=60)
    due = get_due_reminders(db)
    assert len(due) == 1
    assert due[0]["appointment_id"] == "appt-1"


def test_after_appointment_survey_is_not_due_for_a_no_show():
    db = _db("no_show", "after_appointment", offset_minutes=60)
    assert get_due_reminders(db) == []


def test_before_appointment_reminder_is_still_due_for_a_confirmed_booking():
    # Unchanged behavior -- this is the legitimate case for "confirmed".
    db = _db("confirmed", "before_appointment", offset_minutes=-120)
    due = get_due_reminders(db)
    assert len(due) == 1
    assert due[0]["appointment_id"] == "appt-1"


def test_before_appointment_reminder_is_not_due_for_an_already_completed_visit():
    db = _db("completed", "before_appointment", offset_minutes=-120)
    assert get_due_reminders(db) == []
