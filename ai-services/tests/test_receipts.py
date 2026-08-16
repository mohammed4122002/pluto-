"""Receipt matching on the ai-services side: find_pending_receipt_payment
and attach_receipt, used by the submit_payment_receipt tool once Gemini
vision has already told the caller a photo isn't medical/cosmetic.

Mirrors backend/tests/test_receipt_photo_matching.py's scenarios (recency
window on pending/rejected payments) since the matching rule is duplicated
here on purpose -- see receipts.py's module docstring.
"""

import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.receipts import attach_receipt, find_pending_receipt_payment  # noqa: E402


class _Query:
    def __init__(self, table):
        self._table = table
        self._rows = list(table.rows)
        self._update = None
        self._order_col = None
        self._order_desc = False

    def select(self, *_a, **_k):
        return self

    def eq(self, column, value):
        self._rows = [r for r in self._rows if r.get(column) == value]
        return self

    def in_(self, column, values):
        self._rows = [r for r in self._rows if r.get(column) in values]
        return self

    def order(self, column, desc=False):
        self._order_col = column
        self._order_desc = desc
        return self

    def limit(self, n):
        rows = self._rows
        if self._order_col:
            rows = sorted(rows, key=lambda r: r[self._order_col], reverse=self._order_desc)
        self._rows = rows[:n]
        return self

    def update(self, values):
        self._update = values
        return self

    def execute(self):
        if self._update is not None:
            ids = {r["id"] for r in self._rows}
            for row in self._table.rows:
                if row["id"] in ids:
                    row.update(self._update)
            return _Result([])
        return _Result(self._rows)


class _Result:
    def __init__(self, data):
        self.data = data


class _Table:
    def __init__(self, rows=None):
        self.rows = rows or []


class _Db:
    def __init__(self, payments=None):
        self.tables = {"payments": _Table(payments or [])}

    def table(self, name):
        return _Query(self.tables[name])


_NOW = datetime.now(timezone.utc)


def _iso(delta: timedelta) -> str:
    return (_NOW - delta).isoformat()


def test_finds_a_recently_asked_pending_payment():
    db = _Db(
        payments=[
            {
                "id": "pay1",
                "patient_id": "p1",
                "status": "pending",
                "payment_instructions_sent_at": _iso(timedelta(hours=1)),
                "verified_at": None,
                "created_at": _iso(timedelta(hours=1)),
            }
        ]
    )
    assert find_pending_receipt_payment(db, "p1") == "pay1"


def test_a_stale_pending_payment_does_not_match():
    db = _Db(
        payments=[
            {
                "id": "pay1",
                "patient_id": "p1",
                "status": "pending",
                "payment_instructions_sent_at": _iso(timedelta(hours=100)),
                "verified_at": None,
                "created_at": _iso(timedelta(hours=100)),
            }
        ]
    )
    assert find_pending_receipt_payment(db, "p1") is None


def test_finds_a_recently_rejected_payment_being_retried():
    db = _Db(
        payments=[
            {
                "id": "pay1",
                "patient_id": "p1",
                "status": "rejected",
                "payment_instructions_sent_at": None,
                "verified_at": _iso(timedelta(hours=2)),
                "created_at": _iso(timedelta(hours=10)),
            }
        ]
    )
    assert find_pending_receipt_payment(db, "p1") == "pay1"


def test_no_payment_at_all_is_no_match():
    db = _Db(payments=[])
    assert find_pending_receipt_payment(db, "p1") is None


def test_a_verified_or_receipt_submitted_payment_is_never_a_candidate():
    db = _Db(
        payments=[
            {
                "id": "pay1",
                "patient_id": "p1",
                "status": "verified",
                "payment_instructions_sent_at": _iso(timedelta(hours=1)),
                "verified_at": _iso(timedelta(hours=1)),
                "created_at": _iso(timedelta(hours=1)),
            }
        ]
    )
    assert find_pending_receipt_payment(db, "p1") is None


def test_attach_receipt_marks_the_payment_submitted():
    db = _Db(payments=[{"id": "pay1", "patient_id": "p1", "status": "pending"}])
    attach_receipt(db, "pay1", "https://example.com/receipt.jpg")
    row = db.tables["payments"].rows[0]
    assert row["status"] == "receipt_submitted"
    assert row["receipt_image_url"] == "https://example.com/receipt.jpg"
    assert row["submitted_at"]
