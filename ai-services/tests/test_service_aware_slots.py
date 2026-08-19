"""_resolve_service_doctor_ids: which doctors at a branch actually perform
the service the patient chose.

Slots carry no service of their own (they're generated from
doctor_availability), so the slot search used to be blind to what the
patient came for. Confirmed live: a patient chose teeth cleaning at the
Zarqa branch and was offered 9:00/9:30/10:00 with two doctors; after
picking 9:00 he was told first that the doctor had nothing at 9, then that
the service "isn't available at Zarqa" at all -- while Zarqa's Dr. Alaa
Ghoneim was linked to that exact service the whole time. Both statements
were wrong, and they contradicted the times the bot had just offered.

This resolves the same service_doctors/staff_branches path list_services
uses to decide whether a branch offers a service, so the slot search and
the catalogue can't disagree.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.booking import _resolve_service_doctor_ids  # noqa: E402


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

    def execute(self):
        return _Result(self._rows)


class _Result:
    def __init__(self, data):
        self.data = data


class _Db:
    def __init__(self, staff_branches=None, services=None, service_doctors=None):
        self._tables = {
            "staff_branches": staff_branches or [],
            "services": services or [],
            "service_doctors": service_doctors or [],
        }

    def table(self, name):
        return _Query(self._tables.get(name, []))


_CLEANING = {"id": "svc-clean", "name": "تنظيف جير الأسنان", "is_active": True, "deleted_at": None}
_BRACES = {"id": "svc-braces", "name": "تركيب تقويم أسنان", "is_active": True, "deleted_at": None}


def _db(**kwargs):
    return _Db(
        staff_branches=[
            {"staff_id": "alaa", "branch_id": "zarqa"},
            {"staff_id": "khaled", "branch_id": "amman"},
        ],
        services=[_CLEANING, _BRACES],
        service_doctors=[
            {"service_id": "svc-clean", "staff_id": "alaa"},
            {"service_id": "svc-clean", "staff_id": "khaled"},
            {"service_id": "svc-braces", "staff_id": "khaled"},
        ],
        **kwargs,
    )


def test_the_zarqa_teeth_cleaning_case_resolves_to_its_real_doctor():
    # The exact live case: this must not come back empty, because coming
    # back empty is what the bot reported to the patient as "not available
    # at this branch".
    assert _resolve_service_doctor_ids(_db(), "zarqa", "تنظيف جير الأسنان") == {"alaa"}


def test_a_service_genuinely_absent_from_a_branch_resolves_empty():
    # Braces are only linked to Khaled, who works in Amman -- so Zarqa
    # really has nobody for it, and the caller turns this into an explicit
    # service_not_available_at_branch rather than a silent empty slot list.
    assert _resolve_service_doctor_ids(_db(), "zarqa", "تركيب تقويم أسنان") == set()


def test_the_same_service_resolves_to_a_different_doctor_at_another_branch():
    assert _resolve_service_doctor_ids(_db(), "amman", "تنظيف جير الأسنان") == {"khaled"}


def test_no_service_named_means_no_filtering_at_all():
    # None (not an empty set) -- an empty set means "nobody does this here",
    # which would wrongly short-circuit the search into an error.
    assert _resolve_service_doctor_ids(_db(), "zarqa", "") is None
    assert _resolve_service_doctor_ids(_db(), "zarqa", "   ") is None


def test_a_service_nobody_is_linked_to_stays_clinic_wide():
    # list_services treats an unlinked service as offered everywhere, so
    # this must not read as "unavailable" here either -- None means "don't
    # filter", not "nobody does it".
    db = _Db(
        staff_branches=[{"staff_id": "alaa", "branch_id": "zarqa"}],
        services=[{"id": "svc-x", "name": "كشفية عامة", "is_active": True, "deleted_at": None}],
        service_doctors=[],
    )
    assert _resolve_service_doctor_ids(db, "zarqa", "كشفية عامة") is None


def test_an_unknown_service_name_resolves_empty_rather_than_unfiltered():
    # A name matching no service at all must not silently fall through to
    # "search every doctor" -- that's how a patient ends up booked for
    # something the clinic doesn't offer.
    assert _resolve_service_doctor_ids(_db(), "zarqa", "عملية قلب مفتوح") == set()


def test_a_branch_with_no_staff_resolves_empty():
    db = _Db(staff_branches=[], services=[_CLEANING], service_doctors=[{"service_id": "svc-clean", "staff_id": "alaa"}])
    assert _resolve_service_doctor_ids(db, "aqaba", "تنظيف جير الأسنان") == set()
