"""Branch selection in chat: list_active_branches/resolve_branch_id_by_name,
the list_branches/select_branch tools, and the system-prompt block that
only appears for a clinic with more than one branch and a conversation that
hasn't picked one yet.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.routers.chat import _build_system_prompt, _execute_tool  # noqa: E402
from app.services.directory import list_active_branches, resolve_branch_id_by_name  # noqa: E402


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

    def is_(self, column, value):
        target = None if value == "null" else value
        self._rows = [r for r in self._rows if r.get(column) == target]
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
        rows = self._rows
        if self._order_col:
            rows = sorted(rows, key=lambda r: r[self._order_col], reverse=self._order_desc)
        return _Result(rows)


class _Result:
    def __init__(self, data):
        self.data = data


class _Table:
    def __init__(self, rows=None):
        self.rows = rows or []


BRANCH_A = {"id": "b1", "name": "الفرع الرئيسي", "address": "عمّان", "working_hours_note": None, "is_active": True}
BRANCH_B = {"id": "b2", "name": "فرع الزرقاء", "address": None, "working_hours_note": None, "is_active": True}
BRANCH_C_INACTIVE = {"id": "b3", "name": "فرع مغلق", "address": None, "working_hours_note": None, "is_active": False}


class _Db:
    def __init__(self, branches=None, conversations=None, services=None):
        self.tables = {
            "branches": _Table(branches if branches is not None else [BRANCH_A]),
            "conversations": _Table(conversations or []),
            "clinic_settings": _Table([{"clinic_name": "عيادة الاختبار", "about_text": ""}]),
            "services": _Table(services or []),
            "patients": _Table([]),
        }

    def table(self, name):
        return _Query(self.tables.setdefault(name, _Table()))


# --- list_active_branches / resolve_branch_id_by_name -----------------------


def test_lists_only_active_branches_sorted_by_name():
    db = _Db(branches=[BRANCH_B, BRANCH_A, BRANCH_C_INACTIVE])
    result = list_active_branches(db)
    assert [b["name"] for b in result] == ["الفرع الرئيسي", "فرع الزرقاء"]


def test_resolves_a_branch_by_name():
    db = _Db(branches=[BRANCH_A, BRANCH_B])
    assert resolve_branch_id_by_name(db, "فرع الزرقاء") == "b2"


def test_resolve_returns_none_for_no_match():
    db = _Db(branches=[BRANCH_A, BRANCH_B])
    assert resolve_branch_id_by_name(db, "فرع غير موجود") is None


# --- _execute_tool dispatch --------------------------------------------------


def _ctx(conversation_id="c1"):
    return {"conversation_id": conversation_id, "branch_id": "b1", "patient_id": None, "booking_enabled": True}


def test_list_branches_tool_returns_active_branches_only():
    db = _Db(branches=[BRANCH_A, BRANCH_B, BRANCH_C_INACTIVE])
    result = _execute_tool(db, _ctx(), "list_branches", {})
    assert {b["name"] for b in result["branches"]} == {"الفرع الرئيسي", "فرع الزرقاء"}


def test_select_branch_persists_to_the_conversation_and_updates_ctx():
    db = _Db(branches=[BRANCH_A, BRANCH_B], conversations=[{"id": "c1", "branch_id": None}])
    ctx = _ctx()
    result = _execute_tool(db, ctx, "select_branch", {"branch_name": "فرع الزرقاء"})
    assert result == {"selected": True}
    assert ctx["branch_id"] == "b2"
    assert db.tables["conversations"].rows[0]["branch_id"] == "b2"


def test_select_branch_with_an_unknown_name_is_a_clear_error_and_does_not_write():
    db = _Db(branches=[BRANCH_A, BRANCH_B], conversations=[{"id": "c1", "branch_id": None}])
    ctx = _ctx()
    result = _execute_tool(db, ctx, "select_branch", {"branch_name": "فرع في المريخ"})
    assert "error" in result
    assert ctx["branch_id"] == "b1"  # unchanged
    assert db.tables["conversations"].rows[0]["branch_id"] is None


# --- system prompt: only asks when there is a real choice to make -----------


def test_single_branch_clinic_never_shows_the_branch_choice_block():
    db = _Db(branches=[BRANCH_A])
    prompt = _build_system_prompt(db, "b1", {}, branch_selected_explicitly=False)
    assert "أكثر من فرع" not in prompt


def test_multi_branch_clinic_shows_the_block_when_nothing_chosen_yet():
    db = _Db(branches=[BRANCH_A, BRANCH_B])
    prompt = _build_system_prompt(db, "b1", {}, branch_selected_explicitly=False)
    assert "أكثر من فرع" in prompt
    assert "الفرع الرئيسي" in prompt
    assert "فرع الزرقاء" in prompt


def test_multi_branch_clinic_stays_quiet_once_a_branch_was_explicitly_chosen():
    db = _Db(branches=[BRANCH_A, BRANCH_B])
    prompt = _build_system_prompt(db, "b1", {}, branch_selected_explicitly=True)
    assert "أكثر من فرع" not in prompt


def test_default_argument_matches_every_pre_existing_caller():
    # Every call site that predates this feature doesn't pass
    # branch_selected_explicitly at all -- the default must behave as
    # "don't ask", not "ask", or every single-branch clinic (almost all of
    # them) would suddenly get interrogated about a choice that doesn't
    # exist.
    db = _Db(branches=[BRANCH_A, BRANCH_B])
    prompt = _build_system_prompt(db, "b1", {})
    assert "أكثر من فرع" not in prompt
