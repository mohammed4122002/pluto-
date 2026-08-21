"""book_by_doctor_and_time must refuse to book a patient into two
overlapping appointments with different doctors -- unless the second
booking is explicitly for someone else (a child, a relative), signalled by
visit_for_name differing from the patient's own name on file.

Confirmed live: one conversation booked the same patient into two
appointments with two different doctors at the exact same 9:00 slot -- a
dermatology consult and a laser session -- and both went through cleanly.
Nothing in the slot-locking machinery catches this, since it only ever
guards one doctor's one slot against being double-booked by two different
patients, never a single patient's own calendar across different doctors.
"""

import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.booking import (  # noqa: E402
    _patient_double_booking_conflict,
    book_by_doctor_and_time,
)


class _Query:
    def __init__(self, rows):
        self._rows = list(rows)

    def select(self, *_a, **_k):
        return self

    def eq(self, column, value):
        self._rows = [r for r in self._rows if r.get(column) == value]
        return self

    def is_(self, column, value):
        target = None if value == "null" else value
        self._rows = [r for r in self._rows if r.get(column) == target]
        return self

    def in_(self, column, values):
        values = set(values)
        self._rows = [r for r in self._rows if r.get(column) in values]
        return self

    def gte(self, column, value):
        self._rows = [r for r in self._rows if (r.get(column) or "") >= value]
        return self

    def lt(self, column, value):
        self._rows = [r for r in self._rows if (r.get(column) or "") < value]
        return self

    def order(self, *_a, **_k):
        return self

    def limit(self, n):
        self._rows = self._rows[:n]
        return self

    def execute(self):
        return _Result(self._rows)


class _Result:
    def __init__(self, data):
        self.data = data


class _Db:
    def __init__(self, tables):
        self._tables = tables

    def table(self, name):
        return _Query(self._tables.get(name, []))


BRANCH = "branch-1"
PATIENT = "patient-1"
SARA = "staff-sara"
NOUR = "staff-nour"

NOW = datetime.now(timezone.utc)
_EXISTING_START = NOW + timedelta(days=3)
_NEW_START = _EXISTING_START  # exact same instant, two different doctors


def _tables(**overrides):
    base = {
        "staff_branches": [
            {"staff_id": SARA, "branch_id": BRANCH},
            {"staff_id": NOUR, "branch_id": BRANCH},
        ],
        "staff": [
            {"id": SARA, "full_name": "د. سارة الخطيب", "role": "doctor", "is_active": True, "availability_status": "available"},
            {"id": NOUR, "full_name": "د. نور الحوراني", "role": "doctor", "is_active": True, "availability_status": "available"},
        ],
        "branches": [{"id": BRANCH, "timezone": "Asia/Amman"}],
        "clinic_settings": [],
        "slots": [
            {
                "id": "slot-nour",
                "branch_id": BRANCH,
                "doctor_id": NOUR,
                "status": "available",
                "start_at": _NEW_START.isoformat(),
                "duration_minutes": 30,
            }
        ],
        "patients": [{"id": PATIENT, "full_name": "مريم أحمد سالم", "phone": "0790000000"}],
        "appointments": [
            {
                "patient_id": PATIENT,
                "scheduled_at": _EXISTING_START.isoformat(),
                "duration_minutes": 20,
                "status": "confirmed",
                "deleted_at": None,
                "staff": {"full_name": "د. سارة الخطيب"},
                "services": {"name": "كشفية جلدية"},
            }
        ],
    }
    base.update(overrides)
    return base


def _db(**overrides):
    return _Db(_tables(**overrides))


def test_conflict_helper_flags_an_overlapping_appointment():
    conflict = _patient_double_booking_conflict(
        _db(), PATIENT, _NEW_START, _NEW_START + timedelta(minutes=30)
    )
    assert conflict is not None
    assert conflict["staff"]["full_name"] == "د. سارة الخطيب"


def test_conflict_helper_ignores_cancelled_appointments():
    db = _db()
    db._tables["appointments"][0]["status"] = "cancelled_by_patient"
    conflict = _patient_double_booking_conflict(
        db, PATIENT, _NEW_START, _NEW_START + timedelta(minutes=30)
    )
    assert conflict is None


def test_conflict_helper_ignores_non_overlapping_times():
    conflict = _patient_double_booking_conflict(
        db=_db(),
        patient_id=PATIENT,
        start_utc=_NEW_START + timedelta(hours=6),
        end_utc=_NEW_START + timedelta(hours=6, minutes=30),
    )
    assert conflict is None


def test_booking_the_same_patient_into_a_second_overlapping_doctor_is_refused():
    result = book_by_doctor_and_time(
        _db(),
        BRANCH,
        doctor_name="نور الحوراني",
        requested_start_at=_NEW_START.isoformat(),
        patient_id=PATIENT,
        visit_for_name="",
        notes="",
        service_name=None,
    )
    assert result["booked"] is False
    assert "سارة الخطيب" in result["reason"]
    assert "alternative_slots" in result


def test_booking_explicitly_for_someone_else_is_not_blocked(monkeypatch):
    import app.services.booking as booking

    called = {}

    def fake_book_slot_for_patient(db, *, slot_id, patient_id, visit_for_name, notes, service_id=None, patient_package_id=None):
        called["visit_for_name"] = visit_for_name
        return {"id": "appt-new", "appointment_number": "APT-1", "confirmation_code": "AB12"}

    monkeypatch.setattr(booking, "book_slot_for_patient", fake_book_slot_for_patient)

    result = book_by_doctor_and_time(
        _db(),
        BRANCH,
        doctor_name="نور الحوراني",
        requested_start_at=_NEW_START.isoformat(),
        patient_id=PATIENT,
        visit_for_name="سامي أحمد سالم",  # explicitly a different person
        notes="",
        service_name=None,
    )
    assert result["booked"] is True
    assert called["visit_for_name"] == "سامي أحمد سالم"


def test_booking_with_no_conflict_proceeds_normally(monkeypatch):
    import app.services.booking as booking

    monkeypatch.setattr(
        booking,
        "book_slot_for_patient",
        lambda *a, **k: {"id": "appt-new", "appointment_number": "APT-1", "confirmation_code": "AB12"},
    )

    later_start = _NEW_START + timedelta(hours=6)
    db = _db()
    db._tables["slots"][0]["start_at"] = later_start.isoformat()

    result = book_by_doctor_and_time(
        db,
        BRANCH,
        doctor_name="نور الحوراني",
        requested_start_at=later_start.isoformat(),
        patient_id=PATIENT,
        visit_for_name="",
        notes="",
        service_name=None,
    )
    assert result["booked"] is True
