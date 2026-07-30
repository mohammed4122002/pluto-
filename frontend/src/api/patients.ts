import { api } from "./client";

export type Patient = {
  id: string;
  full_name: string;
  phone: string;
  email: string | null;
  date_of_birth: string | null;
  gender: string | null;
  notes: string | null;
  is_merged_into: string | null;
};

export type GuardianCreate = { full_name: string; phone?: string; email?: string };

export type PatientCreate = {
  full_name: string;
  phone: string;
  email?: string;
  date_of_birth?: string;
  gender?: string;
  notes?: string;
  guardian?: GuardianCreate;
};

export type PatientDuplicate = {
  id: string;
  patient_a_id: string;
  patient_b_id: string;
  match_score: number;
  match_reasons: string[];
  status: "pending" | "confirmed_duplicate" | "not_duplicate";
  patient_a_name: string | null;
  patient_a_phone: string | null;
  patient_b_name: string | null;
  patient_b_phone: string | null;
};

export type PatientCreateResult = { patient: Patient; potential_duplicates: PatientDuplicate[] };

export type PatientGuardianLink = {
  patient_id: string;
  guardian_id: string;
  relationship: string | null;
  is_primary: boolean;
  guardian_full_name: string | null;
  guardian_phone: string | null;
};

export type PatientTagValue =
  | "new"
  | "existing"
  | "vip"
  | "corporate"
  | "self_pay"
  | "chronic"
  | "high_risk"
  | "frequent_no_show"
  | "blacklisted";

export type PatientTag = { patient_id: string; tag: PatientTagValue; tagged_at: string };

export const listPatients = (phone?: string) =>
  api.get<Patient[]>("/patients", { params: phone ? { phone } : {} }).then((res) => res.data);

export const createPatient = (payload: PatientCreate) =>
  api.post<PatientCreateResult>("/patients", payload).then((res) => res.data);

export const listPatientGuardians = (patientId: string) =>
  api.get<PatientGuardianLink[]>(`/patients/${patientId}/guardians`).then((res) => res.data);

export const attachGuardian = (patientId: string, guardian: GuardianCreate, relationship?: string) =>
  api.post<PatientGuardianLink>(`/patients/${patientId}/guardians`, { guardian, relationship, is_primary: false }).then((res) => res.data);

export const listPatientTags = (patientId: string) =>
  api.get<PatientTag[]>(`/patients/${patientId}/tags`).then((res) => res.data);

export const addPatientTag = (patientId: string, tag: PatientTagValue) =>
  api.post<PatientTag>(`/patients/${patientId}/tags`, { tag }).then((res) => res.data);

export const removePatientTag = (patientId: string, tag: PatientTagValue) =>
  api.delete(`/patients/${patientId}/tags/${tag}`).then((res) => res.data);

export const listPatientDuplicates = (status: PatientDuplicate["status"] = "pending") =>
  api.get<PatientDuplicate[]>("/patient-duplicates", { params: { status } }).then((res) => res.data);

export const mergePatientDuplicate = (duplicateId: string, survivorId: string) =>
  api.post<Patient>(`/patient-duplicates/${duplicateId}/merge`, { survivor_id: survivorId }).then((res) => res.data);

export const dismissPatientDuplicate = (duplicateId: string) =>
  api.post<PatientDuplicate>(`/patient-duplicates/${duplicateId}/dismiss`).then((res) => res.data);
