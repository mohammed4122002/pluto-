"""Cancelling or no-showing a checked-in patient must clear them from the queue.

Both paths released the appointment's slot but left its queue ticket alone, so
a patient who had already checked in stayed in line on every queue screen after
the visit was called off -- reception kept seeing them, and the doctor would
call a name belonging to someone who had gone home.
"""

import sys
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.queue import close_open_ticket_for_appointment  # noqa: E402
from app.services.scheduling import cancel_appointment, mark_no_show  # noqa: E402
from tests.fake_supabase import FakeSupabase  # noqa: E402

APPT = "appt-1"
BRANCH = "branch-1"
STAFF = "staff-1"
TICKET = "ticket-1"
OTHER_APPT = "appt-2"


def _db(ticket_status: str = "waiting", *, scheduled_at: str = "2020-01-01T09:00:00+00:00") -> FakeSupabase:
    return FakeSupabase(
        {
            "appointments": [
                {
                    "id": APPT,
                    "branch_id": BRANCH,
                    "status": "waiting",
                    "patient_id": "p1",
                    "staff_id": STAFF,
                    "service_id": None,
                    "slot_id": None,
                    "scheduled_at": scheduled_at,
                    "appointment_number": "A-1",
                    "no_show_flag": False,
                    "patient_package_id": None,
                    "services": {"price": 0},
                }
            ],
            "queue_tickets": [
                {"id": TICKET, "appointment_id": APPT, "status": ticket_status, "ticket_number": 1},
                # A different appointment's ticket must be left alone.
                {"id": "ticket-2", "appointment_id": OTHER_APPT, "status": "waiting", "ticket_number": 2},
            ],
            "status_transitions": [
                {"from_status": "waiting", "to_status": s}
                for s in ("cancelled_by_patient", "cancelled_by_clinic", "no_show")
            ],
            "appointment_status_history": [],
            "notification_schedules": [],
            "conversations": [],
            "cancellation_policies": [],
            "clinic_settings": [{"no_show_grace_minutes": 15}],
            "payments": [],
            "refunds": [],
            "branches": [{"id": BRANCH, "currency": "JOD"}],
        }
    )


def _ticket(db: FakeSupabase, ticket_id: str = TICKET) -> dict:
    return next(t for t in db._tables["queue_tickets"] if t["id"] == ticket_id)


@patch("app.services.appointments.fire_status_change_notifications")
def test_cancelling_clears_the_patient_from_the_queue(_no_notify):
    db = _db()
    cancel_appointment(db, APPT, "المريض اعتذر", "patient", STAFF)
    assert _ticket(db)["status"] == "skipped"


@patch("app.services.appointments.fire_status_change_notifications")
def test_no_show_clears_the_patient_from_the_queue(_no_notify):
    db = _db()
    mark_no_show(db, APPT, None, STAFF, override_grace=True)
    assert _ticket(db)["status"] == "skipped"


@patch("app.services.appointments.fire_status_change_notifications")
def test_another_appointments_ticket_is_untouched(_no_notify):
    db = _db()
    cancel_appointment(db, APPT, "المريض اعتذر", "patient", STAFF)
    assert _ticket(db, "ticket-2")["status"] == "waiting"


def test_a_finished_ticket_is_not_reopened_or_rewritten():
    # 'done' means the consultation actually happened; rewriting it to skipped
    # would erase a real visit from the queue history.
    db = _db(ticket_status="done")
    assert close_open_ticket_for_appointment(db, APPT) is None
    assert _ticket(db)["status"] == "done"


def test_no_ticket_at_all_is_not_an_error():
    # The ordinary case: a patient who never checked in.
    db = _db()
    db._tables["queue_tickets"] = []
    assert close_open_ticket_for_appointment(db, APPT) is None


def test_a_called_patient_is_also_cleared():
    db = _db(ticket_status="called")
    close_open_ticket_for_appointment(db, APPT)
    assert _ticket(db)["status"] == "skipped"


@patch("app.services.appointments.fire_status_change_notifications")
def test_bulk_cancelling_clears_checked_in_patients(_no_notify):
    # bulk_cancel_appointments deliberately includes 'checked_in' in its filter,
    # so a doctor-absence sweep cancels people already in the waiting room.
    db = _db(scheduled_at="2026-08-10T09:00:00+00:00")
    db._tables["appointments"][0]["status"] = "checked_in"
    db._tables["status_transitions"] = [
        {"from_status": "checked_in", "to_status": "cancelled_by_doctor"},
    ]
    cancelled = cancel_bulk(db)
    assert cancelled == 1
    assert _ticket(db)["status"] == "skipped"


def cancel_bulk(db: FakeSupabase) -> int:
    from app.services.scheduling import bulk_cancel_appointments

    return bulk_cancel_appointments(
        db, BRANCH, STAFF, "2026-08-10T00:00:00+00:00", "2026-08-11T00:00:00+00:00", "الطبيب مريض", STAFF
    )


@patch("app.services.appointments.fire_status_change_notifications")
def test_rescheduling_clears_the_old_visits_ticket(_no_notify):
    db = _db()
    db._tables["status_transitions"] = [{"from_status": "waiting", "to_status": "rescheduled"}]
    db._tables["slots"] = [
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
    ]
    for key in ("reason_for_visit", "priority", "source", "notes"):
        db._tables["appointments"][0].setdefault(key, None)

    from app.services.scheduling import reschedule_appointment

    reschedule_appointment(db, APPT, "slot-new", "sess-1", "الطبيب تأخر", STAFF)
    assert _ticket(db)["status"] == "skipped"
