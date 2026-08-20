import { api } from "./client";

export type PaymentStatus =
  | "pending"
  | "receipt_submitted"
  | "verified"
  | "rejected"
  | "refunded"
  | "partially_refunded";

export type Payment = {
  id: string;
  appointment_id: string | null;
  patient_id: string;
  amount: number;
  currency: string | null;
  method: string | null;
  status: PaymentStatus;
  payment_type: "deposit" | "full" | "balance" | "package";
  coupon_id: string | null;
  patient_package_id: string | null;
  receipt_image_url: string | null;
  submitted_at: string | null;
  verified_by: string | null;
  verified_at: string | null;
  rejection_reason: string | null;
  notes: string | null;
  created_at: string;
  patient_name: string | null;
  patient_phone: string | null;
  appointment_number: string | null;
  scheduled_at: string | null;
  branch_id: string | null;
};

export type PaymentMethod = {
  id: string;
  branch_id: string | null;
  method_type: "mobile_cash" | "bank_transfer" | "cash" | "other";
  display_name: string;
  account_number: string | null;
  is_active: boolean;
};

export const listPayments = (status?: PaymentStatus) =>
  api.get<Payment[]>("/payments", { params: status ? { status } : {} }).then((res) => res.data);

export const verifyPayment = (id: string) => api.post<Payment>(`/payments/${id}/verify`).then((res) => res.data);

export const rejectPayment = (id: string, reason: string) =>
  api.post<Payment>(`/payments/${id}/reject`, { reason }).then((res) => res.data);

export const applyCoupon = (id: string, code: string) =>
  api.post<Payment>(`/payments/${id}/apply-coupon`, { code }).then((res) => res.data);

export type Refund = { id: string; payment_id: string; amount: number; reason: string; processed_at: string };

export const refundPayment = (id: string, amount: number, reason: string) =>
  api.post<Refund>(`/payments/${id}/refund`, { amount, reason }).then((res) => res.data);

export const listPaymentMethods = (branchId?: string) =>
  api
    .get<PaymentMethod[]>("/payment-methods", { params: branchId ? { branch_id: branchId } : {} })
    .then((res) => res.data);

export const createPaymentMethod = (payload: {
  branch_id?: string;
  method_type: PaymentMethod["method_type"];
  display_name: string;
  account_number?: string;
}) => api.post<PaymentMethod>("/payment-methods", payload).then((res) => res.data);
