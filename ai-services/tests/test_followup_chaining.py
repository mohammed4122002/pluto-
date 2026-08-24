"""service_sequences existed since the original schema (0009) but nothing
ever read it -- a patient could finish the first visit in a recommended
follow-up chain and the assistant would never once mention the second.
pending_followups_for_patient is what actually reads it now.
"""

import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.booking import pending_followups_for_patient  # noqa: E402

PATIENT = "patient-1"
CLEANING = "svc-cleaning"
CHECKUP = "svc-checkup"


class _Result:
    def __init__(self, data):
        self.data = data


class _Query:
    def __init__(self, rows):
        self._rows = list(rows)

    def select(self, *_cols, **_k):
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

    def execute(self):
        return _Result(self._rows)


class _Db:
    def __init__(self, tables):
        self.tables = tables

    def table(self, name):
        return _Query(self.tables.get(name, []))


def _iso(days_ago: int) -> str:
    return (datetime.now(timezone.utc) - timedelta(days=days_ago)).isoformat()


def _db(*, completed_days_ago: int, gap_days: int | None, already_booked_next: bool = False) -> _Db:
    appointments = [
        {
            "id": "appt-old",
            "patient_id": PATIENT,
            "service_id": CLEANING,
            "status": "completed",
            "scheduled_at": _iso(completed_days_ago),
            "deleted_at": None,
        }
    ]
    if already_booked_next:
        appointments.append(
            {
                "id": "appt-next",
                "patient_id": PATIENT,
                "service_id": CHECKUP,
                "status": "confirmed",
                "scheduled_at": _iso(-3),
                "deleted_at": None,
            }
        )
    return _Db(
        {
            "appointments": appointments,
            "service_sequences": [
                {
                    "service_id": CLEANING,
                    "next_service_id": CHECKUP,
                    "is_required": False,
                    "recommended_gap_days": gap_days,
                    "services": {"name": "كشف متابعة"},
                }
            ],
        }
    )


def test_due_once_the_recommended_gap_has_passed():
    db = _db(completed_days_ago=40, gap_days=30)
    due = pending_followups_for_patient(db, PATIENT)
    assert len(due) == 1
    assert due[0]["next_service_id"] == CHECKUP
    assert due[0]["next_service_name"] == "كشف متابعة"


def test_not_yet_due_before_the_gap_passes():
    db = _db(completed_days_ago=10, gap_days=30)
    assert pending_followups_for_patient(db, PATIENT) == []


def test_due_immediately_when_no_gap_is_configured():
    db = _db(completed_days_ago=1, gap_days=None)
    due = pending_followups_for_patient(db, PATIENT)
    assert len(due) == 1


def test_not_surfaced_once_already_booked():
    db = _db(completed_days_ago=40, gap_days=30, already_booked_next=True)
    assert pending_followups_for_patient(db, PATIENT) == []


def test_no_completed_visits_means_nothing_due():
    db = _Db({"appointments": [], "service_sequences": []})
    assert pending_followups_for_patient(db, PATIENT) == []
