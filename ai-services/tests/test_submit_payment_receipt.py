"""The submit_payment_receipt tool, driven through _execute_tool the same
way test_otp_gate.py drives book_appointment -- proving the tool is actually
reachable and actually gated, not just that the underlying receipts.py
functions are individually correct.

This is the AI-side half of "differentiate a payment receipt from a photo
of symptoms": the prompt only calls this tool when Gemini vision already
said the photo isn't medical/cosmetic (see _build_system_prompt's
image_without_medical_description block), and the tool itself refuses
unless there's a real pending/rejected payment recently asked about --
so even a wrong model decision to call it can't misattach an unrelated
photo to a stale or nonexistent payment.
"""

import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.routers.chat import _execute_tool  # noqa: E402


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
    def __init__(self, messages=None, payments=None):
        self.tables = {
            "messages": _Table(messages or []),
            "payments": _Table(payments or []),
        }

    def table(self, name):
        return _Query(self.tables.setdefault(name, _Table()))


_NOW = datetime.now(timezone.utc)


def _ctx(patient_id="p1"):
    return {"conversation_id": "c1", "branch_id": "b1", "patient_id": patient_id, "booking_enabled": True}


def _image_message(url="https://example.com/photo.jpg"):
    return {
        "conversation_id": "c1",
        "direction": "inbound",
        "media_url": url,
        "media_type": "image",
        "created_at": _NOW.isoformat(),
    }


def _pending_payment(asked=timedelta(hours=1)):
    return {
        "id": "pay1",
        "patient_id": "p1",
        "status": "pending",
        "payment_instructions_sent_at": (_NOW - asked).isoformat(),
        "verified_at": None,
        "created_at": (_NOW - asked).isoformat(),
    }


def test_attaches_the_photo_to_a_matching_pending_payment():
    db = _Db(messages=[_image_message()], payments=[_pending_payment()])
    result = _execute_tool(db, _ctx(), "submit_payment_receipt", {})
    assert result == {"submitted": True}
    assert db.tables["payments"].rows[0]["status"] == "receipt_submitted"
    assert db.tables["payments"].rows[0]["receipt_image_url"] == "https://example.com/photo.jpg"


def test_no_image_in_the_latest_message_is_an_error_and_does_not_write():
    db = _Db(messages=[], payments=[_pending_payment()])
    result = _execute_tool(db, _ctx(), "submit_payment_receipt", {})
    assert "error" in result
    assert db.tables["payments"].rows[0]["status"] == "pending"


def test_no_pending_payment_is_an_error_and_does_not_write():
    db = _Db(messages=[_image_message()], payments=[])
    result = _execute_tool(db, _ctx(), "submit_payment_receipt", {})
    assert "error" in result


def test_a_stale_payment_never_asked_about_recently_is_not_matched():
    db = _Db(messages=[_image_message()], payments=[_pending_payment(asked=timedelta(hours=100))])
    result = _execute_tool(db, _ctx(), "submit_payment_receipt", {})
    assert "error" in result
    assert db.tables["payments"].rows[0]["status"] == "pending"


def test_no_patient_on_the_conversation_is_an_error():
    db = _Db(messages=[_image_message()], payments=[_pending_payment()])
    result = _execute_tool(db, _ctx(patient_id=None), "submit_payment_receipt", {})
    assert "error" in result
