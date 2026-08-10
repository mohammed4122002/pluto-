"""Coupons scoped to a group of services.

A coupon used to be all-or-one: coupons.service_id named a single service, or
nothing and it applied to everything. "20% off anything dental" needed one code
per dental service. coupon_services holds the group; no rows still means every
service.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.core.auth import CurrentStaff, get_current_staff  # noqa: E402
from app.core.database import get_supabase  # noqa: E402
from app.routers import coupons as coupons_router  # noqa: E402
from tests.fake_supabase import FakeSupabase  # noqa: E402

COUPON = "11111111-1111-4111-8111-111111111111"
LEGACY = "22222222-2222-4222-8222-222222222222"
DENTAL_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
DENTAL_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
DERMA = "cccccccc-cccc-4ccc-8ccc-cccccccccccc"


def _coupon(cid: str, service_id: str | None = None) -> dict:
    return {
        "id": cid,
        "code": f"C{cid[:4]}",
        "discount_type": "percentage",
        "discount_value": 20.0,
        "valid_from": None,
        "valid_to": None,
        "max_uses": None,
        "used_count": 0,
        "is_active": True,
        "branch_id": None,
        "service_id": service_id,
        "customer_scope": "all",
        "per_customer_limit": None,
    }


def _db() -> FakeSupabase:
    return FakeSupabase(
        {
            "coupons": [_coupon(COUPON), _coupon(LEGACY, service_id=DERMA)],
            "coupon_services": [
                {"coupon_id": COUPON, "service_id": DENTAL_A},
                {"coupon_id": COUPON, "service_id": DENTAL_B},
            ],
        }
    )


def _client(db: FakeSupabase) -> TestClient:
    app = FastAPI()
    app.include_router(coupons_router.router)
    app.dependency_overrides[get_supabase] = lambda: db
    app.dependency_overrides[get_current_staff] = lambda: CurrentStaff(
        id="staff-1",
        full_name="مدير",
        email="a@example.com",
        role="admin",
        permissions={"coupon.view": None, "coupon.manage": None},
    )
    return TestClient(app)


def test_listing_reports_the_group():
    rows = _client(_db()).get("/coupons").json()
    by_id = {r["id"]: r for r in rows}
    assert sorted(by_id[COUPON]["service_ids"]) == sorted([DENTAL_A, DENTAL_B])


def test_a_pre_group_coupon_still_reports_its_single_service():
    rows = _client(_db()).get("/coupons").json()
    by_id = {r["id"]: r for r in rows}
    assert by_id[LEGACY]["service_ids"] == [DERMA]


def test_creating_with_a_group_persists_it():
    db = _db()
    res = _client(db).post(
        "/coupons",
        json={"code": "DENTAL20", "discount_type": "percentage", "discount_value": 20, "service_ids": [DENTAL_A, DENTAL_B]},
    )
    assert res.status_code == 200
    assert sorted(res.json()["service_ids"]) == sorted([DENTAL_A, DENTAL_B])
    # The group belongs in the join table, not as a column on coupons.
    written = {r["service_id"] for r in db.inserts["coupon_services"]}
    assert written == {DENTAL_A, DENTAL_B}


def test_creating_without_services_means_every_service():
    res = _client(_db()).post("/coupons", json={"code": "ALL10", "discount_type": "percentage", "discount_value": 10})
    assert res.json()["service_ids"] == []


def test_deactivating_does_not_wipe_the_group():
    # The UI's "إيقاف" button sends is_active only. Rewriting the group on
    # every PATCH would silently widen the coupon to every service.
    db = _db()
    res = _client(db).patch(f"/coupons/{COUPON}", json={"is_active": False})
    assert res.status_code == 200
    assert res.json()["is_active"] is False
    assert sorted(res.json()["service_ids"]) == sorted([DENTAL_A, DENTAL_B])


def test_sending_an_empty_group_clears_it():
    # Explicitly widening a coupon to every service has to remain possible.
    db = _db()
    res = _client(db).patch(f"/coupons/{COUPON}", json={"service_ids": []})
    assert res.json()["service_ids"] == []
