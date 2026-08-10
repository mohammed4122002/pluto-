from uuid import UUID

from fastapi import APIRouter, Depends
from supabase import Client

from app.core.auth import CurrentStaff, require_permission
from app.core.database import get_supabase
from app.models.schemas import Coupon, CouponCreate, CouponUpdate

router = APIRouter(prefix="/coupons", tags=["coupons"])


def _attach_services(db: Client, coupons: list[dict]) -> list[dict]:
    """Fills service_ids from coupon_services in one query for the whole list.

    A coupon with no rows applies to every service. coupons.service_id is the
    older single-service form and is folded in here so a coupon created before
    the group table still reports its scope correctly.
    """
    if not coupons:
        return coupons
    links = (
        db.table("coupon_services")
        .select("coupon_id, service_id")
        .in_("coupon_id", [c["id"] for c in coupons])
        .execute()
        .data
    )
    by_coupon: dict[str, list[str]] = {}
    for link in links:
        by_coupon.setdefault(link["coupon_id"], []).append(link["service_id"])
    for coupon in coupons:
        ids = by_coupon.get(coupon["id"], [])
        legacy = coupon.get("service_id")
        if legacy and legacy not in ids:
            ids = [*ids, legacy]
        coupon["service_ids"] = ids
    return coupons


def _replace_services(db: Client, coupon_id: str, service_ids: list[UUID]) -> None:
    db.table("coupon_services").delete().eq("coupon_id", coupon_id).execute()
    if service_ids:
        db.table("coupon_services").insert(
            [{"coupon_id": coupon_id, "service_id": str(sid)} for sid in service_ids]
        ).execute()


@router.get("", response_model=list[Coupon])
def list_coupons(_current: CurrentStaff = Depends(require_permission("coupon.view")), db: Client = Depends(get_supabase)):
    return _attach_services(db, db.table("coupons").select("*").execute().data)


@router.post("", response_model=Coupon)
def create_coupon(
    payload: CouponCreate, _current: CurrentStaff = Depends(require_permission("coupon.manage")), db: Client = Depends(get_supabase)
):
    data = payload.model_dump(mode="json")
    service_ids = data.pop("service_ids", []) or []
    created = db.table("coupons").insert(data).execute().data[0]
    _replace_services(db, created["id"], service_ids)
    return _attach_services(db, [created])[0]


@router.patch("/{coupon_id}", response_model=Coupon)
def update_coupon(
    coupon_id: UUID,
    payload: CouponUpdate,
    _current: CurrentStaff = Depends(require_permission("coupon.manage")),
    db: Client = Depends(get_supabase),
):
    updates = payload.model_dump(exclude_unset=True, mode="json")
    service_ids = updates.pop("service_ids", None)
    # An is_active-only toggle must not clear the coupon's services, so the
    # rewrite only happens when service_ids was actually sent.
    if service_ids is not None:
        _replace_services(db, str(coupon_id), service_ids)
    updated = (
        db.table("coupons").update(updates).eq("id", str(coupon_id)).execute().data[0]
        if updates
        else db.table("coupons").select("*").eq("id", str(coupon_id)).limit(1).execute().data[0]
    )
    return _attach_services(db, [updated])[0]
