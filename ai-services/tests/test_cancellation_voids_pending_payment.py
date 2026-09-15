"""cancel_patient_appointment must void a still-open deposit/receipt-review
payment instead of leaving it 'pending' forever.

Confirmed live: a chat cancellation before the patient ever paid the
deposit left a 10 JOD 'pending' payment attached to a cancelled
appointment. That both misrepresents any pending-payments view and stays
eligible for find_pending_receipt_payment to match against a later,
unrelated photo from the same patient -- it only filters on
status in ('pending', 'rejected'), with no check that the appointment the
payment belongs to is still active.
"""

import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.appointments import cancel_patient_appointment  # noqa: E402

BRANCH = "branch-1"
APPT = "appt-1"
PATIENT = "patient-1"


class _Query:
    def __init__(self, rows, backing):
        self._rows = list(rows)
        self._backing = backing
        self._pending_update = None

    def select(self, *_a, **_k):
        return self

    def eq(self, column, value):
        self._rows = [r for r in self._rows if r.get(column) == value]
        return self

    def neq(self, column, value):
        self._rows = [r for r in self._rows if r.get(column) != value]
        return self

    def in_(self, column, values):
        allowed = set(values)
        self._rows = [r for r in self._rows if r.get(column) in allowed]
        return self

    def or_(self, _s):
        return self

    def limit(self, n):
        self._rows = self._rows[:n]
        return self

    def order(self, *_a, **_k):
        return self

    def update(self, values):
        self._pending_update = values
        return self

    def insert(self, rows):
        rows = rows if isinstance(rows, list) else [rows]
        for row in rows:
            row.setdefault("id", f"generated-{len(self._backing)}")
        self._backing.extend(rows)
        self._inserted = rows
        return self

    def execute(self):
        if self._pending_update is not None:
            for row in self._rows:
                row.update(self._pending_update)
        if hasattr(self, "_inserted"):
            return type("R", (), {"data": self._inserted})()
        return type("R", (), {"data": self._rows})()


class _Db:
    def __init__(self, tables):
        self._tables = tables

    def table(self, name):
        backing = self._tables.setdefault(name, [])
        return _Query(backing, backing)


NOW = datetime.now(timezone.utc)


def _appointment(**overrides):
    base = {
        "id": APPT,
        "branch_id": BRANCH,
        "patient_id": PATIENT,
        "status": "confirmed",
        "scheduled_at": (NOW + timedelta(days=3)).isoformat(),
        "slot_id": None,
        "appointment_number": "APT-1",
        "services": {"price": 20},
    }
    base.update(overrides)
    return base


def _db(payments):
    return _Db(
        {
            "appointments": [_appointment()],
            "payments": payments,
            "refunds": [],
            "branches": [{"id": BRANCH, "currency": "JOD"}],
            "cancellation_policies": [],
            "status_transitions": [{"from_status": "confirmed", "to_status": "cancelled_by_patient"}],
            "appointment_status_history": [],
            "slots": [],
        }
    )


def test_cancel_voids_a_never_paid_pending_deposit():
    db = _db([{"id": "pay-1", "appointment_id": APPT, "status": "pending", "amount": 10, "currency": "JOD"}])
    result = cancel_patient_appointment(db, appointment_id=APPT, patient_id=PATIENT, reason="غيّر رأيه")
    assert result["fee"] == 0
    assert db._tables["payments"][0]["status"] == "cancelled"


def test_cancel_voids_a_receipt_awaiting_review():
    db = _db([{"id": "pay-1", "appointment_id": APPT, "status": "receipt_submitted", "amount": 10, "currency": "JOD"}])
    cancel_patient_appointment(db, appointment_id=APPT, patient_id=PATIENT, reason=None)
    assert db._tables["payments"][0]["status"] == "cancelled"


def test_cancel_does_not_touch_an_already_verified_payment():
    """A collected deposit still goes through the normal refund path, not
    the void path -- voiding it would drop the money instead of returning
    it."""
    db = _db([{"id": "pay-1", "appointment_id": APPT, "status": "verified", "amount": 10, "currency": "JOD"}])
    result = cancel_patient_appointment(db, appointment_id=APPT, patient_id=PATIENT, reason=None)
    assert result["refunded"] == 10
    assert db._tables["payments"][0]["status"] == "refunded"
