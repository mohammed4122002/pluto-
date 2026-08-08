"""Cancellation/no-show fee settlement: `settle_appointment_fee` nets the fee
against whatever the patient already paid instead of stacking a brand-new
charge next to an untouched deposit -- refund the surplus, charge only the
shortfall, and never touch anything when there's nothing to settle.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.payments import settle_appointment_fee  # noqa: E402
from tests.fake_supabase import FakeSupabase  # noqa: E402

BRANCH = "branch-1"
APPT = "appt-1"
PATIENT = "patient-1"
STAFF = "staff-1"


def _appointment():
    return {"id": APPT, "branch_id": BRANCH, "patient_id": PATIENT}


def _db(payments: list[dict]) -> FakeSupabase:
    return FakeSupabase(
        {
            "payments": payments,
            "refunds": [],
            "branches": [{"id": BRANCH, "currency": "JOD"}],
            "conversations": [],
        }
    )


def _verified_payment(amount: float, payment_type: str = "deposit") -> dict:
    return {
        "id": "pay-1",
        "appointment_id": APPT,
        "patient_id": PATIENT,
        "amount": amount,
        "currency": "JOD",
        "status": "verified",
        "payment_type": payment_type,
        "patient_package_id": None,
    }


def test_no_fee_and_no_deposit_touches_nothing():
    db = _db([])
    result = settle_appointment_fee(db, _appointment(), 0.0, STAFF)
    assert result == {"fee_charged": 0.0, "fee_pending": 0.0, "refunded": 0.0}
    assert db.inserts == {}


def test_no_fee_with_deposit_refunds_in_full():
    db = _db([_verified_payment(10)])
    result = settle_appointment_fee(db, _appointment(), 0.0, STAFF)
    assert result == {"fee_charged": 0.0, "fee_pending": 0.0, "refunded": 10.0}
    assert db.inserts["refunds"][0]["amount"] == 10.0
    assert db._tables["payments"][0]["status"] == "refunded"
    assert "payments" not in db.inserts or all(
        p["payment_type"] != "cancellation_fee" for p in db.inserts.get("payments", [])
    )


def test_fee_smaller_than_deposit_nets_the_difference():
    db = _db([_verified_payment(10)])
    result = settle_appointment_fee(db, _appointment(), 4.0, STAFF)
    assert result == {"fee_charged": 4.0, "fee_pending": 0.0, "refunded": 6.0}
    assert db.inserts["refunds"][0]["amount"] == 6.0
    # $4 of the $10 deposit was kept to cover the fee -- only a partial
    # refund of that payment row, not a full one.
    assert db._tables["payments"][0]["status"] == "partially_refunded"
    # The fee was fully covered by the deposit -- no separate cancellation_fee
    # charge should be created on top of it.
    assert "payments" not in db.inserts


def test_fee_larger_than_deposit_charges_only_the_shortfall():
    db = _db([_verified_payment(4)])
    result = settle_appointment_fee(db, _appointment(), 10.0, STAFF)
    assert result == {"fee_charged": 10.0, "fee_pending": 6.0, "refunded": 0.0}
    assert "refunds" not in db.inserts
    assert db._tables["payments"][0]["status"] == "verified"
    new_charges = [p for p in db.inserts["payments"] if p["payment_type"] == "cancellation_fee"]
    assert len(new_charges) == 1
    assert new_charges[0]["amount"] == 6.0


def test_fee_with_no_deposit_charges_the_full_fee_like_before():
    db = _db([])
    result = settle_appointment_fee(db, _appointment(), 5.0, STAFF)
    assert result == {"fee_charged": 5.0, "fee_pending": 5.0, "refunded": 0.0}
    new_charges = [p for p in db.inserts["payments"] if p["payment_type"] == "cancellation_fee"]
    assert len(new_charges) == 1
    assert new_charges[0]["amount"] == 5.0


def test_settlement_ignores_unverified_and_prior_fee_payments():
    db = _db(
        [
            {**_verified_payment(20), "id": "pay-pending", "status": "pending"},
            {**_verified_payment(999), "id": "pay-fee", "payment_type": "cancellation_fee", "status": "verified"},
        ]
    )
    result = settle_appointment_fee(db, _appointment(), 5.0, STAFF)
    # Neither the unverified deposit nor a prior cancellation_fee row counts
    # as money in hand to net against.
    assert result == {"fee_charged": 5.0, "fee_pending": 5.0, "refunded": 0.0}


def test_automated_refund_can_be_attributed_to_no_staff():
    db = _db([_verified_payment(10)])
    result = settle_appointment_fee(db, _appointment(), 0.0, None)
    assert result["refunded"] == 10.0
    assert db.inserts["refunds"][0]["processed_by"] is None
