"""A coupon can cover one service, a group of them, or everything.

Before coupon_services existed a coupon had exactly two options: one service
(coupons.service_id) or all of them. A clinic wanting "20% off anything
dental" had to create one code per service.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.booking import coupon_covers_service, coupon_services_of  # noqa: E402

DENTAL_A = "svc-dental-a"
DENTAL_B = "svc-dental-b"
DERMA = "svc-derma"


def test_a_coupon_with_no_services_covers_everything():
    coupon = {"coupon_services": [], "service_id": None}
    assert coupon_services_of(coupon) == set()
    assert coupon_covers_service(coupon, DERMA)
    assert coupon_covers_service(coupon, DENTAL_A)


def test_a_group_coupon_covers_only_its_group():
    coupon = {"coupon_services": [{"service_id": DENTAL_A}, {"service_id": DENTAL_B}], "service_id": None}
    assert coupon_services_of(coupon) == {DENTAL_A, DENTAL_B}
    assert coupon_covers_service(coupon, DENTAL_A)
    assert coupon_covers_service(coupon, DENTAL_B)
    assert not coupon_covers_service(coupon, DERMA)


def test_the_legacy_single_service_column_still_scopes():
    # A coupon created before the group table, never backfilled, must keep
    # the scope it was created with rather than silently widening to all.
    coupon = {"coupon_services": [], "service_id": DERMA}
    assert coupon_services_of(coupon) == {DERMA}
    assert coupon_covers_service(coupon, DERMA)
    assert not coupon_covers_service(coupon, DENTAL_A)


def test_legacy_and_group_are_unioned_not_conflicting():
    coupon = {"coupon_services": [{"service_id": DENTAL_A}], "service_id": DERMA}
    assert coupon_services_of(coupon) == {DENTAL_A, DERMA}
    assert coupon_covers_service(coupon, DENTAL_A)
    assert coupon_covers_service(coupon, DERMA)
    assert not coupon_covers_service(coupon, DENTAL_B)


def test_a_missing_key_is_treated_as_unscoped():
    # Rows selected without the nested join must not crash the check.
    assert coupon_covers_service({}, DERMA)


class _Rows:
    """Just enough of the Supabase query surface for active_coupons_for_branch."""

    def __init__(self, rows):
        self._rows = rows

    def select(self, *_):
        return self

    def eq(self, *_):
        return self

    def order(self, *_, **__):
        return self

    def execute(self):
        from types import SimpleNamespace

        return SimpleNamespace(data=self._rows)


class _Db:
    def __init__(self, rows):
        self._rows = rows

    def table(self, _name):
        return _Rows(self._rows)


BRANCH = "branch-1"


def _coupon(**over):
    base = {
        "id": "c1",
        "code": "X",
        "discount_type": "percentage",
        "discount_value": 10,
        "branch_id": None,
        "service_id": None,
        "valid_to": None,
        "max_uses": None,
        "used_count": 0,
        "coupon_services": [],
    }
    base.update(over)
    return base


def _codes(rows, service_id=None):
    from app.services.booking import active_coupons_for_branch

    return [c["code"] for c in active_coupons_for_branch(_Db(rows), BRANCH, service_id)]


def test_a_group_coupon_is_offered_only_for_its_services():
    rows = [
        _coupon(code="ALL"),
        _coupon(code="DENTAL", coupon_services=[{"service_id": DENTAL_A}, {"service_id": DENTAL_B}]),
    ]
    assert _codes(rows, DENTAL_A) == ["ALL", "DENTAL"]
    assert _codes(rows, DERMA) == ["ALL"]


def test_without_a_service_every_coupon_is_offered():
    # What a patient asking "عندكم كوبونات؟" before picking a service sees.
    rows = [_coupon(code="ALL"), _coupon(code="DENTAL", coupon_services=[{"service_id": DENTAL_A}])]
    assert _codes(rows) == ["ALL", "DENTAL"]


def test_an_exhausted_coupon_is_not_offered():
    # Offering a code that will be refused at checkout is worse than silence.
    rows = [_coupon(code="USEDUP", max_uses=5, used_count=5), _coupon(code="LIVE", max_uses=5, used_count=4)]
    assert _codes(rows) == ["LIVE"]


def test_another_branchs_coupon_is_not_offered():
    rows = [_coupon(code="OTHER", branch_id="branch-2"), _coupon(code="MINE", branch_id=BRANCH)]
    assert _codes(rows) == ["MINE"]


# --- Packages the clinic sells -------------------------------------------
# active_packages_for_patient answers "what did this patient already buy".
# Nothing answered "what do we sell", so the assistant could never offer one.


def _package(**over):
    base = {"id": "pk1", "name": "باقة", "sessions_count": 5, "price": 90, "validity_days": 365, "package_services": []}
    base.update(over)
    return base


def _pkg_names(rows, service_id=None):
    from app.services.booking import purchasable_packages

    return [p["name"] for p in purchasable_packages(_Db(rows), service_id)]


def test_a_package_scoped_to_services_is_offered_only_for_them():
    rows = [
        _package(name="عامة"),
        _package(name="أسنان", package_services=[{"service_id": DENTAL_A}, {"service_id": DENTAL_B}]),
    ]
    assert _pkg_names(rows, DENTAL_A) == ["عامة", "أسنان"]
    assert _pkg_names(rows, DERMA) == ["عامة"]


def test_without_a_service_the_whole_catalogue_is_offered():
    rows = [_package(name="عامة"), _package(name="أسنان", package_services=[{"service_id": DENTAL_A}])]
    assert _pkg_names(rows) == ["عامة", "أسنان"]


# --- Service prices carry their currency ----------------------------------
# list_services returned a bare number, so the assistant supplied a unit of
# its own: a Jordanian clinic's prices came back quoted in "جنيه".


class _ServiceRows:
    def __init__(self, tables):
        self._tables = tables
        self._name = None

    def table(self, name):
        self._name = name
        return self

    def select(self, *_):
        return self

    def eq(self, *_):
        return self

    def is_(self, *_):
        return self

    def order(self, *_, **__):
        return self

    def limit(self, *_):
        return self

    def execute(self):
        from types import SimpleNamespace

        return SimpleNamespace(data=self._tables.get(self._name, []))


def test_service_prices_come_back_with_the_branch_currency():
    from app.services.directory import list_services

    db = _ServiceRows(
        {
            "services": [
                {"id": "s1", "name": "كشفية باطنية", "description": None, "price": 25,
                 "duration_minutes": 20, "specialty_id": None, "specialties": {"name_ar": "باطنية"}}
            ],
            "branches": [{"currency": "JOD"}],
            "staff_branches": [],
            "service_doctors": [],
        }
    )
    out = list_services(db, "branch-1")
    assert out[0]["price"] == 25
    assert out[0]["currency"] == "JOD"


def test_a_branch_with_no_currency_set_reports_an_empty_one():
    # Better an empty string the prompt can react to than a guessed unit.
    from app.services.directory import list_services

    db = _ServiceRows(
        {
            "services": [
                {"id": "s1", "name": "كشفية", "description": None, "price": 10,
                 "duration_minutes": 20, "specialty_id": None, "specialties": None}
            ],
            "branches": [{"currency": None}],
            "staff_branches": [],
            "service_doctors": [],
        }
    )
    assert list_services(db, "branch-1")[0]["currency"] == ""
