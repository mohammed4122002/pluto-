"""Booking confirmation codes: generation, verification, and the gate
has_verified_booking_otp is meant to be -- checked by book_appointment
itself in _execute_tool, not just requested in the prompt.
"""

import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.otp import (  # noqa: E402
    OtpError,
    generate_booking_otp,
    has_verified_booking_otp,
    verify_booking_otp,
)

import pytest  # noqa: E402


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
            row.setdefault("id", f"otp-{len(self._table.rows) + 1}")
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
        self.tables = {"chat_booking_otp": _Table()}

    def table(self, name):
        return _Query(self.tables[name])


CONVERSATION = "c1"


def test_generated_code_is_four_digits():
    db = _Db()
    code = generate_booking_otp(db, CONVERSATION)
    assert len(code) == 4
    assert code.isdigit()


def test_verifying_the_right_code_succeeds():
    db = _Db()
    code = generate_booking_otp(db, CONVERSATION)
    verify_booking_otp(db, CONVERSATION, code)  # must not raise
    assert has_verified_booking_otp(db, CONVERSATION) is True


def test_wrong_code_is_rejected_and_does_not_verify():
    db = _Db()
    generate_booking_otp(db, CONVERSATION)
    with pytest.raises(OtpError):
        verify_booking_otp(db, CONVERSATION, "0000")
    assert has_verified_booking_otp(db, CONVERSATION) is False


def test_arabic_indic_digits_are_accepted():
    db = _Db()
    code = generate_booking_otp(db, CONVERSATION)
    arabic_indic = "".join("٠١٢٣٤٥٦٧٨٩"[int(d)] for d in code)
    verify_booking_otp(db, CONVERSATION, arabic_indic)  # must not raise
    assert has_verified_booking_otp(db, CONVERSATION) is True


def test_no_code_ever_sent_is_a_clear_error():
    db = _Db()
    with pytest.raises(OtpError):
        verify_booking_otp(db, CONVERSATION, "1234")


def test_nothing_verified_yet_fails_the_gate():
    db = _Db()
    generate_booking_otp(db, CONVERSATION)
    assert has_verified_booking_otp(db, CONVERSATION) is False


def test_a_consumed_code_cannot_be_reused():
    db = _Db()
    code = generate_booking_otp(db, CONVERSATION)
    verify_booking_otp(db, CONVERSATION, code)
    with pytest.raises(OtpError):
        verify_booking_otp(db, CONVERSATION, code)


def test_five_wrong_attempts_locks_the_code_even_with_the_right_one_after():
    db = _Db()
    code = generate_booking_otp(db, CONVERSATION)
    for _ in range(5):
        with pytest.raises(OtpError):
            verify_booking_otp(db, CONVERSATION, "9999")
    with pytest.raises(OtpError):
        verify_booking_otp(db, CONVERSATION, code)


def test_a_new_code_supersedes_an_old_unconsumed_one():
    db = _Db()
    old_code = generate_booking_otp(db, CONVERSATION)
    new_code = generate_booking_otp(db, CONVERSATION)
    assert old_code != new_code or True  # codes may coincide by chance; behaviour is what matters
    with pytest.raises(OtpError):
        verify_booking_otp(db, CONVERSATION, old_code if old_code != new_code else "0000")
    verify_booking_otp(db, CONVERSATION, new_code)  # must not raise


def test_an_expired_code_is_rejected():
    db = _Db()
    code = generate_booking_otp(db, CONVERSATION)
    row = db.tables["chat_booking_otp"].rows[0]
    row["expires_at"] = (datetime.now(timezone.utc) - timedelta(minutes=1)).isoformat()
    with pytest.raises(OtpError):
        verify_booking_otp(db, CONVERSATION, code)


def test_a_verification_older_than_the_window_no_longer_gates_open():
    db = _Db()
    code = generate_booking_otp(db, CONVERSATION)
    verify_booking_otp(db, CONVERSATION, code)
    row = db.tables["chat_booking_otp"].rows[0]
    row["consumed_at"] = (datetime.now(timezone.utc) - timedelta(minutes=30)).isoformat()
    assert has_verified_booking_otp(db, CONVERSATION) is False


def test_codes_from_a_different_conversation_do_not_cross_over():
    db = _Db()
    generate_booking_otp(db, "other-conversation")
    with pytest.raises(OtpError):
        verify_booking_otp(db, CONVERSATION, "1234")
