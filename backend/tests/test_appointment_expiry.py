"""Past appointments that nobody ever resolved.

Nothing expired appointments at all -- the 'expired' status existed and was
never set by anything, so bookings that lapsed unconfirmed sat "waiting for
confirmation" forever. Confirmed for real: 5 confirmed and 2 waiting
appointments were still open days after their time had passed.

The line that matters: a lapsed *unconfirmed* booking asserts nothing
clinical or financial, so a machine may close it. A past *confirmed* one
raises "did they turn up?" and "is a no-show fee owed?", which only a human
can answer -- auto-answering would charge real patients retroactively.
"""

import sys
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.scheduling import expire_past_unconfirmed_appointments  # noqa: E402
from tests.fake_supabase import FakeSupabase  # noqa: E402

PAST = "2026-08-03T08:00:00+00:00"
FUTURE = "2099-01-01T08:00:00+00:00"


def _appt(appt_id: str, status: str, scheduled_at: str) -> dict:
    return {"id": appt_id, "status": status, "scheduled_at": scheduled_at, "deleted_at": None}


def _db(appointments: list[dict]) -> FakeSupabase:
    # apply_status_transition validates against status_transitions, so the
    # allowed edges have to be present for the transition to go through.
    return FakeSupabase(
        {
            "appointments": appointments,
            "status_transitions": [
                {"from_status": "requested", "to_status": "expired"},
                {"from_status": "pending_payment", "to_status": "expired"},
                {"from_status": "waitlisted", "to_status": "expired"},
            ],
            "appointment_status_history": [],
            "notification_schedules": [],
        }
    )


def _statuses(db: FakeSupabase) -> dict[str, str]:
    return {r["id"]: r["status"] for r in db._tables["appointments"]}


@patch("app.services.appointments.fire_status_change_notifications")
def test_expires_past_unconfirmed_appointments(_no_notifications):
    db = _db(
        [
            _appt("a1", "requested", PAST),
            _appt("a2", "pending_payment", PAST),
            _appt("a3", "waitlisted", PAST),
        ]
    )
    assert expire_past_unconfirmed_appointments(db) == 3
    assert _statuses(db) == {"a1": "expired", "a2": "expired", "a3": "expired"}


@patch("app.services.appointments.fire_status_change_notifications")
def test_never_touches_a_past_confirmed_appointment(_no_notifications):
    # The whole point: auto-deciding this would mean auto-charging a no-show
    # fee, or falsely recording a visit that may never have happened.
    db = _db([_appt("a1", "confirmed", PAST), _appt("a2", "patient_confirmed", PAST)])
    assert expire_past_unconfirmed_appointments(db) == 0
    assert _statuses(db) == {"a1": "confirmed", "a2": "patient_confirmed"}


@patch("app.services.appointments.fire_status_change_notifications")
def test_never_touches_someone_who_actually_showed_up(_no_notifications):
    # 'waiting' means the patient physically arrived and queued. Calling that
    # expired -- or no_show -- would be a plain lie about what happened.
    db = _db([_appt("a1", "waiting", PAST), _appt("a2", "checked_in", PAST)])
    assert expire_past_unconfirmed_appointments(db) == 0
    assert _statuses(db) == {"a1": "waiting", "a2": "checked_in"}


@patch("app.services.appointments.fire_status_change_notifications")
def test_leaves_future_unconfirmed_appointments_alone(_no_notifications):
    db = _db([_appt("a1", "requested", FUTURE), _appt("a2", "pending_payment", FUTURE)])
    assert expire_past_unconfirmed_appointments(db) == 0
    assert _statuses(db) == {"a1": "requested", "a2": "pending_payment"}


@patch("app.services.appointments.fire_status_change_notifications")
def test_expires_only_the_eligible_rows_in_a_mixed_backlog(_no_notifications):
    db = _db(
        [
            _appt("stale", "requested", PAST),
            _appt("confirmed-past", "confirmed", PAST),
            _appt("upcoming", "requested", FUTURE),
        ]
    )
    assert expire_past_unconfirmed_appointments(db) == 1
    assert _statuses(db) == {
        "stale": "expired",
        "confirmed-past": "confirmed",
        "upcoming": "requested",
    }


@patch("app.services.appointments.fire_status_change_notifications")
def test_one_rejected_transition_does_not_abort_the_backlog(_no_notifications):
    # 'waitlisted -> expired' is dropped from the transition table here, so
    # that row is rejected -- the other two must still be cleared.
    db = _db([_appt("a1", "requested", PAST), _appt("a2", "waitlisted", PAST), _appt("a3", "pending_payment", PAST)])
    db._tables["status_transitions"] = [
        {"from_status": "requested", "to_status": "expired"},
        {"from_status": "pending_payment", "to_status": "expired"},
    ]
    assert expire_past_unconfirmed_appointments(db) == 2
    assert _statuses(db) == {"a1": "expired", "a2": "waitlisted", "a3": "expired"}


@patch("app.services.appointments.fire_status_change_notifications")
def test_nothing_to_do_is_not_an_error(_no_notifications):
    assert expire_past_unconfirmed_appointments(_db([])) == 0
