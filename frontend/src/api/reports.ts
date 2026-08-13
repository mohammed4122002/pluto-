import { api } from "./client";

export type DashboardReport = {
  period: { date_from: string; date_to: string };
  appointments: {
    total: number;
    confirmed: number;
    completed: number;
    cancelled: number;
    no_show_rate: number;
    rescheduling_rate: number;
    confirmation_rate: number;
  };
  financial: {
    currency: string;
    revenue: number;
    deposits: number;
    refunds: number;
    cancellation_fees: number;
  };
  ai_chat: {
    total_conversations: number;
    escalated_to_human: number;
    escalation_rate: number;
    provider_failures: number;
    bookings: number;
  };
  breakdown: {
    by_channel: { channel: string; count: number }[];
    by_service: { service_id: string; service_name: string | null; count: number }[];
    new_patients: number;
    existing_patients: number;
  };
  utilization: {
    slot_utilization_rate: number;
    unused_slots: number;
    occupancy_by_doctor: { doctor_id: string; doctor_name: string | null; booked: number; total: number; rate: number }[];
  };
  waitlist: { current_count: number; cancellation_fill_rate: number };
  /** day_of_week follows Python's datetime.weekday(): 0 = Monday ... 6 = Sunday. */
  demand_heatmap: { day_of_week: number; hour: number; count: number }[];
};

export const getDashboardReport = (params: { branch_id?: string; date_from?: string; date_to?: string } = {}) =>
  api.get<DashboardReport>("/reports/dashboard", { params }).then((res) => res.data);
