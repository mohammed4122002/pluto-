import { api } from "./client";

export type CouponDiscountType = "fixed" | "percentage" | "free_session" | "free_consultation" | "service_upgrade";
export type CouponCustomerScope = "all" | "new" | "existing";

export type Coupon = {
  id: string;
  code: string;
  discount_type: CouponDiscountType;
  discount_value: number | null;
  valid_from: string | null;
  valid_to: string | null;
  max_uses: number | null;
  used_count: number;
  is_active: boolean;
  branch_id: string | null;
  /** Superseded by service_ids; still returned for coupons created before
   *  service groups existed. */
  service_id: string | null;
  /** Services the coupon is limited to. Empty means every service. */
  service_ids: string[];
  customer_scope: CouponCustomerScope;
  per_customer_limit: number | null;
};

export const listCoupons = () => api.get<Coupon[]>("/coupons").then((res) => res.data);

export const createCoupon = (payload: {
  code: string;
  discount_type: CouponDiscountType;
  discount_value?: number;
  max_uses?: number;
  branch_id?: string;
  service_ids?: string[];
  customer_scope?: CouponCustomerScope;
  per_customer_limit?: number;
}) => api.post<Coupon>("/coupons", payload).then((res) => res.data);

export const deactivateCoupon = (id: string) =>
  api.patch<Coupon>(`/coupons/${id}`, { is_active: false }).then((res) => res.data);
