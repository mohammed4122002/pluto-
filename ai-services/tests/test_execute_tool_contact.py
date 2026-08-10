"""The save_contact_info tool as the model actually reaches it.

Every validation rule in booking.py was covered, and the tool was still
completely broken in production: the wiring in _execute_tool referenced
`payload`, which does not exist in that function's scope. Every single call
raised NameError, got swallowed by the generic `except Exception`, and the
patient was told "صار خطأ تقني بسيط" -- which also set
_contact_rejected_this_turn, so no new patient could ever complete a booking.
Found by driving a real booking against the deployed service.

So these tests go through _execute_tool rather than calling the validators
directly: the bug was never in the rules, it was in reaching them.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.routers.chat import _execute_tool, _patient_said  # noqa: E402


class _Query:
    def __init__(self, table):
        self._table = table
        self._update = None
        self._filters = []

    def select(self, *_a, **_k):
        return self

    def eq(self, column, value):
        self._filters.append(lambda row: row.get(column) == value)
        return self

    def neq(self, column, value):
        self._filters.append(lambda row: row.get(column) != value)
        return self

    def limit(self, *_a, **_k):
        return self

    def update(self, values):
        self._update = values
        return self

    def _matching(self):
        return [row for row in self._table.rows if all(f(row) for f in self._filters)]

    def execute(self):
        if self._update is not None:
            for row in self._matching():
                row.update(self._update)
            self._table.updates.append(self._update)
            return _Result([])
        return _Result(self._matching())


class _Result:
    def __init__(self, data):
        self.data = data


class _Table:
    def __init__(self, rows):
        self.rows = rows
        self.updates = []


class _Db:
    """Just enough Supabase surface for save_contact_info: patients rows are
    looked up by phone (dedup) and then updated."""

    def __init__(self):
        self.tables = {"patients": _Table([{"id": "p1", "full_name": "Sami", "phone": "+962790000666"}])}

    def table(self, name):
        return _Query(self.tables.setdefault(name, _Table([])))


def _ctx(history):
    return {
        "branch_id": "b1",
        "patient_id": "p1",
        "booking_enabled": True,
        "patient_said": _patient_said(history),
    }


HISTORY = [
    {"role": "user", "content": "مرحبا بدي احجز، اسمي سامي خالد ورقمي 0791234567"},
    {"role": "assistant", "content": "بحتاج اسمك الثلاثي يا أستاذ سامي خالد الأحمد"},
    {"role": "user", "content": "عفوا، اسمي سامي خالد النجار"},
]


def test_saves_a_name_the_patient_gave():
    db = _Db()
    result = _execute_tool(
        db, _ctx(HISTORY), "save_contact_info", {"full_name": "سامي خالد النجار", "phone": "0791234567"}
    )
    # Not {"error": ...} -- the whole point. This is the assertion that would
    # have caught the NameError before it reached a patient.
    assert result == {"saved": True, "full_name": "سامي خالد النجار", "phone": "0791234567"}
    assert db.tables["patients"].updates == [{"full_name": "سامي خالد النجار", "phone": "0791234567"}]


def test_rejects_a_family_name_only_the_assistant_ever_said():
    db = _Db()
    ctx = _ctx(HISTORY)
    result = _execute_tool(db, ctx, "save_contact_info", {"full_name": "سامي خالد الأحمد", "phone": "0791234567"})
    assert "الأحمد" in result["error"]
    assert db.tables["patients"].updates == []
    # And nothing may be booked in the same turn the details were refused.
    assert ctx["_contact_rejected_this_turn"] is True


def test_patient_said_excludes_the_assistants_own_words():
    said = _patient_said(HISTORY)
    assert "النجار" in said
    assert "الأحمد" not in said
