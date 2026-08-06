import { api } from "./client";

export type EscalationStaffMember = {
  id: string;
  staff_id: string;
  staff_name: string | null;
  branch_id: string | null;
  is_active: boolean;
};

export const listEscalationStaff = () =>
  api.get<EscalationStaffMember[]>("/escalation-staff").then((res) => res.data);

export const addEscalationStaff = (staffId: string, branchId?: string) =>
  api
    .post<EscalationStaffMember>("/escalation-staff", { staff_id: staffId, branch_id: branchId })
    .then((res) => res.data);

export const removeEscalationStaff = (id: string) =>
  api.delete(`/escalation-staff/${id}`).then((res) => res.data);
