"""Verifying a deposit is what confirms a held booking.

With clinic_settings.require_deposit_to_confirm on, a new booking stops at
'pending_payment' instead of going straight to 'confirmed'. Something then
has to finish the job when the money arrives -- otherwise the patient pays
and the appointment sits pending forever.
"""

import sys
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.payments import create_payment_for_appointment, verify_payment  # noqa: E402
from tests.fake_supabase import FakeSupabase  # noqa: E402

APPT = "appt-1"
PAYMENT = "pay-1"
STAFF = "staff-1"


def _db(appointment_status: str, payments: list[dict] | None = None) -> FakeSupabase:
    return FakeSupabase(
        {
            "payments": payments
            if payments is not None
            else [
                {
                    "id": PAYMENT,
                    "appointment_id": APPT,
                    "patient_id": "p1",
                    "amount": 15,
                    "status": "receipt_submitted",
                    "patient_package_id": None,
                }
            ],
            "appointments": [
                {
                    "id": APPT,
                    "status": appointment_status,
                    "patient_id": "p1",
                    "branch_id": "b1",
                    "appointment_number": "A-1",
                    "patient_package_id": None,
                    "services": {"price": 25, "deposit_amount": 15},
                }
            ],
            "status_transitions": [{"from_status": "pending_payment", "to_status": "confirmed"}],
            "appointment_status_history": [],
            "notification_schedules": [],
            "conversations": [],
            "branches": [{"id": "b1", "currency": "JOD"}],
            "payment_methods": [],
        }
    )


def _status(db: FakeSupabase) -> str:
    return db._tables["appointments"][0]["status"]


@patch("app.services.appointments.fire_status_change_notifications")
@patch("app.services.payments._resolve_channel_for_patient", return_value=None)
def test_verifying_the_deposit_confirms_the_held_booking(_no_channel, _no_notify):
    db = _db("pending_payment")
    verify_payment(db, PAYMENT, STAFF)
    assert _status(db) == "confirmed"


@patch("app.services.appointments.fire_status_change_notifications")
@patch("app.services.payments._resolve_channel_for_patient", return_value=None)
def test_does_not_touch_an_appointment_that_was_never_held(_no_channel, _no_notify):
    # Deposit gate off: the booking confirmed at creation and a later payment
    # verification must not re-drive its status.
    db = _db("checked_in")
    verify_payment(db, PAYMENT, STAFF)
    assert _status(db) == "checked_in"


@patch("app.services.appointments.fire_status_change_notifications")
@patch("app.services.payments._resolve_channel_for_patient", return_value=None)
def test_confirming_does_not_charge_the_patient_a_second_time(_no_channel, _no_notify):
    # Confirming fires create_payment_for_appointment, and with the gate on
    # the confirmation happens *because* a payment was just verified. Without
    # a guard the patient is billed twice for one booking.
    db = _db("pending_payment")
    verify_payment(db, PAYMENT, STAFF)
    assert "payments" not in db.inserts


@patch("app.services.payments._resolve_channel_for_patient", return_value=None)
def test_no_new_payment_when_one_already_exists(_no_channel):
    db = _db("confirmed")
    create_payment_for_appointment(db, APPT)
    assert "payments" not in db.inserts


@patch("app.services.payments._resolve_channel_for_patient", return_value=None)
def test_still_creates_the_first_payment_when_there_is_none(_no_channel):
    db = _db("confirmed", payments=[])
    create_payment_for_appointment(db, APPT)
    # deposit_amount wins over price, matching the booking path's precedence.
    assert db.inserts["payments"][0]["amount"] == 15
