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
from app.services.booking import _date_of_birth_from_age  # noqa: E402


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


# --- Age, saved independently of name/phone --------------------------------

AGE_HISTORY = [
    {"role": "user", "content": "مرحبا بدي احجز، عمري 25"},
]


def test_saves_an_age_alone_for_a_patient_already_known_by_name_and_phone():
    db = _Db()
    result = _execute_tool(
        db, _ctx(AGE_HISTORY), "save_contact_info", {"full_name": "", "phone": "", "age": 25}
    )
    assert result == {"saved": True, "full_name": "Sami", "phone": "+962790000666"}
    assert db.tables["patients"].updates == [{"date_of_birth": _date_of_birth_from_age(25)}]
    # And the name/phone already on file must survive an age-only save.
    assert db.tables["patients"].rows[0]["full_name"] == "Sami"
    assert db.tables["patients"].rows[0]["phone"] == "+962790000666"


def test_rejects_an_age_the_patient_never_mentioned():
    db = _Db()
    ctx = _ctx(HISTORY)  # sami's history never mentions an age
    result = _execute_tool(db, ctx, "save_contact_info", {"full_name": "", "phone": "", "age": 40})
    assert "العمر" in result["error"]
    assert db.tables["patients"].updates == []


def test_saves_name_phone_and_age_together_for_a_new_patient():
    db = _Db()
    history = [{"role": "user", "content": "اسمي سامي خالد النجار ورقمي 0791234567 وعمري 25"}]
    result = _execute_tool(
        db,
        _ctx(history),
        "save_contact_info",
        {"full_name": "سامي خالد النجار", "phone": "0791234567", "age": 25},
    )
    assert result == {"saved": True, "full_name": "سامي خالد النجار", "phone": "0791234567"}
    assert db.tables["patients"].updates == [
        {"full_name": "سامي خالد النجار", "phone": "0791234567", "date_of_birth": _date_of_birth_from_age(25)}
    ]


def test_zero_age_from_the_model_means_not_mentioned_not_an_actual_age():
    # The tool schema tells the model to send 0 when the patient hasn't
    # given an age -- 0 must never reach validate_age as a real value.
    db = _Db()
    result = _execute_tool(
        db, _ctx(HISTORY), "save_contact_info", {"full_name": "سامي خالد النجار", "phone": "0791234567", "age": 0}
    )
    assert result == {"saved": True, "full_name": "سامي خالد النجار", "phone": "0791234567"}
    assert db.tables["patients"].updates == [{"full_name": "سامي خالد النجار", "phone": "0791234567"}]
