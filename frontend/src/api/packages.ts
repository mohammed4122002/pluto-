import { api } from "./client";

export type Package = {
  id: string;
  name: string;
  service_ids: string[];
  sessions_count: number;
  price: number;
  validity_days: number;
  is_active: boolean;
};

export type PatientPackage = {
  id: string;
  patient_id: string;
  package_id: string;
  branch_id: string;
  sessions_remaining: number;
  status: "pending_payment" | "active" | "cancelled" | "expired";
  purchased_at: string;
  expires_at: string;
};

export const listPackages = (serviceId?: string) =>
  api.get<Package[]>("/packages", { params: serviceId ? { service_id: serviceId } : {} }).then((res) => res.data);

export const createPackage = (payload: {
  name: string;
  service_ids?: string[];
  sessions_count: number;
  price: number;
  validity_days?: number;
}) => api.post<Package>("/packages", payload).then((res) => res.data);

export const listPatientPackages = (
  params: { patient_id?: string; branch_id?: string; expiring_within_days?: number } = {},
) => api.get<PatientPackage[]>("/patient-packages", { params }).then((res) => res.data);

export const listActivePatientPackages = (patientId: string, serviceId?: string) =>
  api
    .get<PatientPackage[]>("/patient-packages/active", { params: { patient_id: patientId, service_id: serviceId } })
    .then((res) => res.data);

export const sellPackage = (payload: { patient_id: string; package_id: string; branch_id: string }) =>
  api.post<PatientPackage>("/patient-packages", payload).then((res) => res.data);

export const consumePackageSession = (patientPackageId: string) =>
  api.post<PatientPackage>(`/patient-packages/${patientPackageId}/use-session`).then((res) => res.data);
