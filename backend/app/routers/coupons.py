from uuid import UUID

from fastapi import APIRouter, Depends
from supabase import Client

from app.core.auth import CurrentStaff, require_permission
from app.core.database import get_supabase
from app.models.schemas import Coupon, CouponCreate, CouponUpdate

router = APIRouter(prefix="/coupons", tags=["coupons"])


@router.get("", response_model=list[Coupon])
def list_coupons(_current: CurrentStaff = Depends(require_permission("coupon.view")), db: Client = Depends(get_supabase)):
    return db.table("coupons").select("*").execute().data


@router.post("", response_model=Coupon)
def create_coupon(
    payload: CouponCreate, _current: CurrentStaff = Depends(require_permission("coupon.manage")), db: Client = Depends(get_supabase)
):
    return db.table("coupons").insert(payload.model_dump(mode="json")).execute().data[0]


@router.patch("/{coupon_id}", response_model=Coupon)
def update_coupon(
    coupon_id: UUID,
    payload: CouponUpdate,
    _current: CurrentStaff = Depends(require_permission("coupon.manage")),
    db: Client = Depends(get_supabase),
):
    updates = payload.model_dump(exclude_unset=True)
    return db.table("coupons").update(updates).eq("id", str(coupon_id)).execute().data[0]
