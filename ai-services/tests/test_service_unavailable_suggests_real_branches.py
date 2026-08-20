"""When a named service isn't offered at the branch a patient asked about,
the alternative branches suggested must be ones that actually offer it --
not just "some other branch" guessed off the full branch list.

Confirmed live: pediatrics ("كشفية أطفال") is only staffed at two of a
clinic's four branches (Amman main and Zarqa). Asked about a third branch
(Irbid), the assistant correctly said it wasn't offered there, then
suggested three "other" branches including Aqaba -- which doesn't have a
pediatrician either, sending the patient into the exact same dead end it
had just apologized for. The old service_not_available_at_branch error only
said "suggest another branch via list_branches", which returns every
branch with no service filter, leaving the model to guess.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.booking import _branches_offering_service, search_available_slots  # noqa: E402


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


AMMAN = "amman"
ZARQA = "zarqa"
IRBID = "irbid"
AQABA = "aqaba"
LAMA = "lama"
MUSAAB = "musaab"

_TABLES = {
    "staff_branches": [
        {"staff_id": MUSAAB, "branch_id": AMMAN},
        {"staff_id": LAMA, "branch_id": ZARQA},
    ],
    "services": [{"id": "svc-peds", "name": "كشفية أطفال", "is_active": True, "deleted_at": None}],
    "service_doctors": [
        {"service_id": "svc-peds", "staff_id": MUSAAB},
        {"service_id": "svc-peds", "staff_id": LAMA},
    ],
    "branches": [
        {"id": AMMAN, "name": "عيادة بلوتو - عمّان (الفرع الرئيسي)", "timezone": "Asia/Amman"},
        {"id": ZARQA, "name": "عيادة بلوتو - الزرقاء", "timezone": "Asia/Amman"},
        {"id": IRBID, "name": "عيادة بلوتو - إربد", "timezone": "Asia/Amman"},
        {"id": AQABA, "name": "عيادة بلوتو - العقبة", "timezone": "Asia/Amman"},
    ],
    "clinic_settings": [],
    "slots": [],
}


def _db():
    return _Db({k: [dict(r) for r in v] for k, v in _TABLES.items()})


def test_only_branches_that_actually_offer_it_are_suggested():
    result = _branches_offering_service(_db(), "كشفية أطفال", exclude_branch_id=IRBID)
    assert set(result) == {"عيادة بلوتو - عمّان (الفرع الرئيسي)", "عيادة بلوتو - الزرقاء"}
    # Aqaba has nobody linked to this service -- must never appear.
    assert "عيادة بلوتو - العقبة" not in result


def test_the_branch_being_asked_about_is_excluded_from_its_own_suggestion():
    result = _branches_offering_service(_db(), "كشفية أطفال", exclude_branch_id=AMMAN)
    assert "عيادة بلوتو - عمّان (الفرع الرئيسي)" not in result
    assert result == ["عيادة بلوتو - الزرقاء"]


def test_search_available_slots_surfaces_the_real_branch_list():
    result = search_available_slots(_db(), IRBID, service_name="كشفية أطفال")
    assert result["service_not_available_at_branch"] is True
    assert set(result["available_at_other_branches"]) == {
        "عيادة بلوتو - عمّان (الفرع الرئيسي)",
        "عيادة بلوتو - الزرقاء",
    }
    assert "العقبة" not in result["error"]


def test_no_service_named_returns_no_branch_suggestion():
    assert _branches_offering_service(_db(), "", exclude_branch_id=IRBID) == []


def test_a_service_nobody_anywhere_offers_returns_an_empty_list():
    db = _db()
    db._tables["service_doctors"] = []
    assert _branches_offering_service(db, "كشفية أطفال", exclude_branch_id=IRBID) == []
