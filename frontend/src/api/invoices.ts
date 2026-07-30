import { api } from "./client";

export type Invoice = {
  id: string;
  appointment_id: string | null;
  patient_id: string;
  invoice_number: string;
  subtotal: number;
  discount: number;
  total: number;
  issued_at: string;
};

export const listInvoices = (branchId?: string) =>
  api.get<Invoice[]>("/invoices", { params: branchId ? { branch_id: branchId } : {} }).then((res) => res.data);

export const createInvoice = (appointmentId: string, discount = 0) =>
  api.post<Invoice>("/invoices", { appointment_id: appointmentId, discount }).then((res) => res.data);
