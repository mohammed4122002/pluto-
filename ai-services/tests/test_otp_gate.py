"""book_appointment must not be reachable without a verified confirmation
code -- enforced in _execute_tool itself, not just requested in the prompt.

Every validation rule can be individually correct and the gate still not
exist: save_contact_info's own real-production bug (see
test_execute_tool_contact.py's docstring) was exactly this shape. So this
drives _execute_tool directly and proves book_by_doctor_and_time is never
reached without a verified code, and is reached once there is one.
"""

import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.routers.chat import _execute_tool  # noqa: E402


class _Query:
    def __init__(self, table):
        self._table = table
        self._rows = list(table.rows)
        self._update = None
        self._insert = None
        self._order_col = None
        self._order_desc = False

    def select(self, *_a, **_k):
        return self

    def eq(self, column, value):
        self._rows = [r for r in self._rows if r.get(column) == value]
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

    def insert(self, values):
        self._insert = values
        return self

    def update(self, values):
        self._update = values
        return self

    def execute(self):
        if self._insert is not None:
            row = dict(self._insert)
            row.setdefault("id", f"row-{len(self._table.rows) + 1}")
            row.setdefault("attempts", 0)
            row.setdefault("consumed_at", None)
            row["created_at"] = datetime.now(timezone.utc).isoformat()
            self._table.rows.append(row)
            return _Result([row])
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
    def __init__(self):
        self.tables = {
            "patients": _Table([{"id": "p1", "full_name": "سامي خالد النجار", "phone": "+962790000666"}]),
            "chat_booking_otp": _Table(),
        }

    def table(self, name):
        return _Query(self.tables.setdefault(name, _Table()))


def _ctx(conversation_id="c1"):
    return {
        "conversation_id": conversation_id,
        "branch_id": "b1",
        "patient_id": "p1",
        "booking_enabled": True,
        "patient_said": "بدي احجز بكرة الساعة 10 مع دكتور سامي",
        "last_patient_message": "بدي احجز بكرة الساعة 10 مع دكتور سامي",
        "cancel_confirmation_asked": False,
    }


BOOK_ARGS = {
    "doctor_name": "د. سامي",
    "start_at": "2026-08-20T10:00:00",
    "visit_for_name": "",
    "reason_for_visit": "",
    "service_name": "",
    "use_patient_package_id": "",
}


@patch("app.routers.chat.book_by_doctor_and_time")
def test_booking_is_refused_without_any_code_ever_sent(mock_book):
    db = _Db()
    result = _execute_tool(db, _ctx(), "book_appointment", BOOK_ARGS)
    assert "error" in result
    assert "تحقق" in result["error"] or "confirmation" in result["error"].lower()
    mock_book.assert_not_called()


@patch("app.routers.chat.book_by_doctor_and_time")
def test_booking_is_refused_after_a_code_was_sent_but_never_verified(mock_book):
    db = _Db()
    _execute_tool(db, _ctx(), "send_confirmation_code", {})
    result = _execute_tool(db, _ctx(), "book_appointment", BOOK_ARGS)
    assert "error" in result
    mock_book.assert_not_called()


@patch("app.routers.chat.book_by_doctor_and_time")
def test_booking_is_refused_after_a_wrong_code(mock_book):
    db = _Db()
    _execute_tool(db, _ctx(), "send_confirmation_code", {})
    verify = _execute_tool(db, _ctx(), "verify_confirmation_code", {"code": "0000"})
    assert verify["verified"] is False
    result = _execute_tool(db, _ctx(), "book_appointment", BOOK_ARGS)
    assert "error" in result
    mock_book.assert_not_called()


@patch("app.routers.chat.book_by_doctor_and_time")
def test_booking_proceeds_once_the_right_code_is_verified(mock_book):
    mock_book.return_value = {
        "booked": True,
        "id": "appt-1",
        "appointment_number": "APT-1",
        "confirmation_code": "000000",
        "scheduled_at": "2026-08-20T10:00:00Z",
        # billed_to_package=True short-circuits confirm_booking_and_request_
        # payment, which needs a fuller fake DB than this test cares about --
        # what's under test here is only that the OTP gate lets the call
        # through, not what happens after.
        "patient_package_id": "pp1",
    }
    db = _Db()
    sent = _execute_tool(db, _ctx(), "send_confirmation_code", {})
    verify = _execute_tool(db, _ctx(), "verify_confirmation_code", {"code": sent["code"]})
    assert verify == {"verified": True}
    _execute_tool(db, _ctx(), "book_appointment", BOOK_ARGS)
    mock_book.assert_called_once()


@patch("app.routers.chat.book_by_doctor_and_time")
def test_a_verification_older_than_the_window_no_longer_authorizes_booking(mock_book):
    db = _Db()
    sent = _execute_tool(db, _ctx(), "send_confirmation_code", {})
    _execute_tool(db, _ctx(), "verify_confirmation_code", {"code": sent["code"]})
    # Simulate the verification having happened a while ago.
    db.tables["chat_booking_otp"].rows[0]["consumed_at"] = (
        datetime.now(timezone.utc) - timedelta(minutes=30)
    ).isoformat()
    result = _execute_tool(db, _ctx(), "book_appointment", BOOK_ARGS)
    assert "error" in result
    mock_book.assert_not_called()


@patch("app.routers.chat.book_by_doctor_and_time")
def test_a_code_verified_for_a_different_conversation_does_not_authorize_this_one(mock_book):
    db = _Db()
    other_ctx = _ctx(conversation_id="c2")
    sent = _execute_tool(db, other_ctx, "send_confirmation_code", {})
    _execute_tool(db, other_ctx, "verify_confirmation_code", {"code": sent["code"]})
    result = _execute_tool(db, _ctx(conversation_id="c1"), "book_appointment", BOOK_ARGS)
    assert "error" in result
    mock_book.assert_not_called()
