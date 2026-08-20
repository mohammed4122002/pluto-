"""search_available_slots: a named service that resolves to real doctors at
this branch (via service_doctors/staff_branches -- the same data
list_services' catalog uses) must not be vetoed by a separate, possibly
stale doctor_specialties tag on those same doctors.

Confirmed live: "كشفية أطفال" (pediatrics checkup) was shown in the
branch's own catalog (list_services), linked there to two doctors, at
least one of them assigned to this branch. The patient picked it, went
through the full name/phone registration flow, and only then -- when
find_available_slots ran with both specialty_query and service_name --
was told "تخصص كشفية الأطفال مش متوفر بفرعنا الرئيسي": the specialty check
(doctor_specialties) failed because neither doctor had that specialty
tagged on their staff profile, even though service_doctors said plainly
they perform this exact service here. The specialty check ran first and
short-circuited before the service check ever got a say.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.booking import search_available_slots  # noqa: E402


class _Query:
    def __init__(self, rows):
        self._rows = list(rows)

    def select(self, *_a, **_k):
        return self

    def eq(self, column, value):
        self._rows = [r for r in self._rows if r.get(column) == value]
        return self

    def neq(self, column, value):
        self._rows = [r for r in self._rows if r.get(column) != value]
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


BRANCH = "rania"
MUSAAB = "musaab"
LAMA = "lama"


def _db():
    return _Db(
        {
            "staff_branches": [{"staff_id": MUSAAB, "branch_id": BRANCH}],
            "services": [{"id": "svc-peds", "name": "كشفية أطفال", "is_active": True, "deleted_at": None}],
            "service_doctors": [
                {"service_id": "svc-peds", "staff_id": MUSAAB},
                {"service_id": "svc-peds", "staff_id": LAMA},
            ],
            # Neither doctor has a doctor_specialties row for "أطفال" -- the
            # profile-level tag was never filled in, even though they're
            # explicitly assigned to perform this exact service.
            "staff": [{"id": MUSAAB, "doctor_specialties": []}],
            "branches": [{"timezone": "Asia/Amman"}],
            "clinic_settings": [],
            "slots": [],
        }
    )


def test_a_service_doctors_link_overrides_a_missing_specialty_tag():
    result = search_available_slots(
        _db(), BRANCH, specialty_query="أطفال", service_name="كشفية أطفال"
    )
    assert not result.get("specialty_not_found")
    assert not result.get("service_not_available_at_branch")
    assert result["slots"] == []


def test_a_specialty_search_alone_still_blocks_when_nobody_here_has_it():
    # No service_name at all -- the specialty check is the only signal, so a
    # branch with nobody tagged for it must still read as unavailable rather
    # than silently unfiltered.
    result = search_available_slots(_db(), BRANCH, specialty_query="أطفال")
    assert result.get("specialty_not_found") is True


def test_a_service_genuinely_absent_from_the_branch_still_blocks():
    db = _db()
    db._tables["staff_branches"] = [{"staff_id": LAMA, "branch_id": "other-branch"}]
    result = search_available_slots(db, BRANCH, specialty_query="أطفال", service_name="كشفية أطفال")
    assert result.get("service_not_available_at_branch") is True
