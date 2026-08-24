import { api } from "./client";

export type BranchHoliday = {
  id: string;
  branch_id: string;
  holiday_date: string;
  reason: string | null;
  is_full_day: boolean;
  start_time: string | null;
  end_time: string | null;
};

export type BranchHolidayCreate = {
  branch_id: string;
  holiday_date: string;
  reason: string;
  is_full_day: boolean;
  start_time: string | null;
  end_time: string | null;
};

export type BranchHolidayResult = {
  holiday: BranchHoliday;
  /** Already-generated slots this closure took off the market. */
  blocked_slots: number;
};

export const listHolidays = (branchId: string) =>
  api.get<BranchHoliday[]>("/branch-holidays", { params: { branch_id: branchId } }).then((res) => res.data);

export const createHoliday = (payload: BranchHolidayCreate) =>
  api.post<BranchHolidayResult>("/branch-holidays", payload).then((res) => res.data);

export const deleteHoliday = (id: string) =>
  api.delete<{ deleted: boolean; reopened_slots: number }>(`/branch-holidays/${id}`).then((res) => res.data);
