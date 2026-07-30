import { api } from "./client";

export type Coupon = {
  id: string;
  code: string;
  discount_type: "fixed" | "percentage";
  discount_value: number;
  valid_from: string | null;
  valid_to: string | null;
  max_uses: number | null;
  used_count: number;
  is_active: boolean;
};

export const listCoupons = () => api.get<Coupon[]>("/coupons").then((res) => res.data);

export const createCoupon = (payload: {
  code: string;
  discount_type: Coupon["discount_type"];
  discount_value: number;
  max_uses?: number;
}) => api.post<Coupon>("/coupons", payload).then((res) => res.data);

export const deactivateCoupon = (id: string) =>
  api.patch<Coupon>(`/coupons/${id}`, { is_active: false }).then((res) => res.data);
