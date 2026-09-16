/** Demo data for the published design preview.
 *
 * The preview build swaps the axios adapter for this one, so every screen
 * renders a plausible clinic without a backend: the published page is the real
 * React app with real components and real interactions, only the network layer
 * is replaced. Writes are accepted and echoed back so a form or a dialog
 * completes the way it would against the API. */
import type { AxiosAdapter, AxiosResponse } from "axios";

const iso = (dayOffset: number, hour: number, minute = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
};

const branches = [
  { id: "b1", name: "فرع الرابية", address: "شارع الملكة رانيا", phone: "+96265551234", timezone: "Asia/Amman", is_active: true },
  { id: "b2", name: "فرع خلدا", address: "شارع وصفي التل", phone: "+96265559876", timezone: "Asia/Amman", is_active: true },
];

const specialties = [
  { id: "sp1", name: "أسنان", name_ar: "أسنان", is_active: true },
  { id: "sp2", name: "جلدية", name_ar: "جلدية", is_active: true },
];

const staff = [
  { id: "s1", full_name: "د. محمد النور", email: "nour@clinic.jo", phone: "+962790000001", role: "doctor", is_active: true, branch_ids: ["b1"], specialty_id: "sp1", specialty_ids: ["sp1"] },
  { id: "s2", full_name: "د. رنا العلي", email: "rana@clinic.jo", phone: "+962790000002", role: "doctor", is_active: true, branch_ids: ["b1", "b2"], specialty_id: "sp2", specialty_ids: ["sp2"] },
  { id: "s3", full_name: "ليلى قاسم", email: "laila@clinic.jo", phone: "+962790000003", role: "receptionist", is_active: true, branch_ids: ["b1"], specialty_id: null, specialty_ids: [] },
  { id: "s4", full_name: "سامر حدّاد", email: "samer@clinic.jo", phone: "+962790000004", role: "admin", is_active: true, branch_ids: ["b1", "b2"], specialty_id: null, specialty_ids: [] },
];

const services = [
  { id: "sv1", name: "كشف عام", branch_id: "b1", duration_minutes: 30, price: 25, currency: "د.أ", deposit_amount: 10, is_active: true, specialty_id: "sp1", description: "فحص وتشخيص أولي" },
  { id: "sv2", name: "تنظيف أسنان", branch_id: "b1", duration_minutes: 45, price: 40, currency: "د.أ", deposit_amount: 15, is_active: true, specialty_id: "sp1", description: "تنظيف وتلميع" },
  { id: "sv3", name: "جلسة ليزر", branch_id: "b2", duration_minutes: 60, price: 85, currency: "د.أ", deposit_amount: 25, is_active: true, specialty_id: "sp2", description: "جلسة ليزر للوجه" },
];

const patientNames = [
  "سارة أحمد الخطيب", "عمر خالد المصري", "ليان محمود", "يوسف الزعبي", "نور الدين عباس",
  "هبة سليمان", "كريم الشوابكة", "دانا العموش", "أحمد برهوم", "ريم الفاعوري",
];

const patients = patientNames.map((full_name, i) => ({
  id: `p${i + 1}`,
  full_name,
  phone: `+96279${String(1000000 + i * 13571).slice(0, 7)}`,
  email: i % 3 === 0 ? `patient${i + 1}@example.com` : "",
  notes: i % 4 === 0 ? "حساسية من البنسلين" : i % 5 === 0 ? "تفضّل المواعيد المسائية" : "",
  date_of_birth: `19${70 + i}-0${(i % 9) + 1}-1${i % 9}`,
  branch_id: i % 2 ? "b2" : "b1",
  tags: i === 0 ? ["vip", "chronic"] : i === 2 ? ["new"] : i === 5 ? ["frequent_no_show"] : [],
  created_at: iso(-30 + i, 10),
}));

const statuses = ["confirmed", "requested", "completed", "checked_in", "waiting", "no_show", "cancelled", "patient_confirmed"];
const appointments = Array.from({ length: 14 }).map((_, i) => ({
  id: `a${i + 1}`,
  appointment_number: `A-${1040 + i}`,
  branch_id: i % 3 === 0 ? "b2" : "b1",
  patient_id: `p${(i % patients.length) + 1}`,
  staff_id: i % 2 ? "s2" : "s1",
  service_id: i % 3 === 0 ? "sv3" : i % 2 ? "sv2" : "sv1",
  slot_id: null,
  scheduled_at: iso(i < 6 ? 0 : i - 6, 9 + (i % 8), (i % 2) * 30),
  duration_minutes: 30,
  status: i < 6 ? statuses[i % 5] : statuses[i % statuses.length],
  visit_type_id: "v1",
  meeting_link: null,
  referral_source: i % 4 === 0 ? "إنستغرام" : null,
  created_at: iso(-3, 12),
}));

const payments = Array.from({ length: 8 }).map((_, i) => ({
  id: `pay${i + 1}`,
  appointment_id: i % 4 === 3 ? null : `a${i + 1}`,
  patient_id: `p${(i % patients.length) + 1}`,
  amount: [45, 120, 300, 75.5, 25, 85, 40, 60][i],
  currency: "د.أ",
  method: i % 2 ? "bank_transfer" : "mobile_cash",
  status: "receipt_submitted",
  payment_type: (["deposit", "full", "package", "balance"] as const)[i % 4],
  coupon_id: i === 1 ? "c1" : null,
  patient_package_id: i % 4 === 3 ? "pk1" : null,
  receipt_image_url: i % 3 === 2 ? null : "https://example.com/receipt.jpg",
  submitted_at: iso(-1, 14),
  verified_by: null,
  verified_at: null,
  rejection_reason: null,
  notes: null,
  created_at: iso(-2, 11),
  patient_name: patients[i % patients.length].full_name,
  patient_phone: patients[i % patients.length].phone,
  appointment_number: i % 4 === 3 ? null : `A-${1040 + i}`,
  scheduled_at: iso(i % 5, 10 + i),
  branch_id: "b1",
}));

const conversations = Array.from({ length: 6 }).map((_, i) => ({
  id: `c${i + 1}`,
  patient_id: `p${i + 1}`,
  patient_name: patients[i].full_name,
  patient_phone: patients[i].phone,
  channel_id: "ch1",
  channel_type: "whatsapp",
  status: i < 2 ? "needs_attention" : "open",
  needs_attention: i < 2,
  ai_enabled: i > 1,
  last_message_at: iso(0, 9 + i),
  last_message_preview: ["بدي أأجل موعدي بكرا", "كم سعر تنظيف الأسنان؟", "شكراً إلكم", "وصلني الإيصال؟", "في دور اليوم؟", "بدي أحجز عند د. رنا"][i],
  unread_count: i < 2 ? 2 : 0,
  assigned_staff_id: null,
  escalation_reason: i === 0 ? "طلب إداري" : null,
  created_at: iso(-1, 9),
}));

const queues = [
  { id: "q-b1-s1", branch_id: "b1", doctor_id: "s1", room_id: null, service_id: null, queue_date: iso(0, 0).slice(0, 10), is_active: true },
  { id: "q-b1-s2", branch_id: "b1", doctor_id: "s2", room_id: null, service_id: null, queue_date: iso(0, 0).slice(0, 10), is_active: true },
];

const ticketStatuses = ["waiting", "called", "in_progress", "waiting", "done"] as const;
const queueTickets = Array.from({ length: 5 }).map((_, i) => ({
  id: `qt${i + 1}`,
  queue_id: queues[i % 2].id,
  appointment_id: `a${i + 1}`,
  patient_id: `p${i + 1}`,
  ticket_number: 10 + i,
  priority_level: (i === 1 ? "emergency" : i === 3 ? "elderly" : "normal") as
    | "normal"
    | "emergency"
    | "elderly",
  status: ticketStatuses[i],
  arrival_status: (i === 2 ? "late" : "on_time") as "late" | "on_time",
  checked_in_at: iso(0, 8 + i),
  called_at: i > 0 ? iso(0, 9 + i) : null,
  started_at: i === 2 ? iso(0, 9, 30) : null,
  ended_at: i === 4 ? iso(0, 10) : null,
}));

/** The doctor's own queue, calendar and day -- the /me/* endpoints the
 * workspace screens read instead of the clinic-wide ones. */
const myTickets = queueTickets.slice(0, 4).map((t, i) => ({
  id: t.id,
  ticket_number: t.ticket_number,
  status: t.status,
  priority_level: t.priority_level,
  arrival_status: t.arrival_status,
  patient_id: t.patient_id,
  patient_name: patients[i].full_name,
  patient_phone: patients[i].phone,
  appointment_id: t.appointment_id,
  checked_in_at: t.checked_in_at,
  called_at: t.called_at,
  started_at: t.started_at,
  ended_at: t.ended_at,
  estimated_entry_time: iso(0, 10 + i),
}));

const myAppointments = appointments.slice(0, 5).map((a, i) => ({
  id: a.id,
  scheduled_at: a.scheduled_at,
  duration_minutes: 30,
  status: a.status,
  patient_id: a.patient_id,
  patient_name: patients[i % patients.length].full_name,
  patient_phone: patients[i % patients.length].phone,
  service_name: services[i % services.length].name,
  branch_id: "b1",
  branch_name: "فرع الرابية",
  branch_timezone: "Asia/Amman",
  reason_for_visit: i === 0 ? "ألم في الضرس" : null,
  queue_number: i < 3 ? 10 + i : null,
  check_in_time: i < 3 ? iso(0, 8 + i) : null,
  slot_id: null,
}));

const deskArrivals = appointments.slice(0, 7).map((a, i) => ({
  appointment_id: a.id,
  scheduled_at: a.scheduled_at,
  duration_minutes: 30,
  status: a.status,
  patient_id: a.patient_id,
  patient_name: patients[i % patients.length].full_name,
  patient_phone: patients[i % patients.length].phone,
  doctor_name: i % 2 ? "د. رنا العلي" : "د. محمد النور",
  service_name: services[i % services.length].name,
  confirmation_code: `C-${4820 + i}`,
  checked_in: i < 3,
  ticket_number: i < 3 ? 10 + i : null,
  queue_status: (i === 0 ? "in_progress" : i === 1 ? "called" : i === 2 ? "waiting" : null) as
    | "waiting"
    | "called"
    | "in_progress"
    | null,
}));

const dashboard = {
  period: { date_from: iso(-7, 0), date_to: iso(0, 23) },
  appointments: { total: 124, confirmed: 98, completed: 81, cancelled: 12, no_show_rate: 7.4, rescheduling_rate: 11.2, confirmation_rate: 79 },
  financial: { currency: "د.أ", revenue: 8450, deposits: 1320, refunds: 210, cancellation_fees: 180 },
  ai_chat: { total_conversations: 268, escalated_to_human: 41, escalation_rate: 15.3, provider_failures: 3, bookings: 88 },
  breakdown: {
    by_channel: [{ channel: "whatsapp", count: 88 }, { channel: "staff", count: 24 }, { channel: "web", count: 12 }],
    by_service: [
      { service_id: "sv1", service_name: "كشف عام", count: 64 },
      { service_id: "sv2", service_name: "تنظيف أسنان", count: 38 },
      { service_id: "sv3", service_name: "جلسة ليزر", count: 22 },
    ],
    new_patients: 31,
    existing_patients: 93,
  },
  utilization: {
    slot_utilization_rate: 72,
    unused_slots: 44,
    occupancy_by_doctor: [
      { doctor_id: "s1", doctor_name: "د. محمد النور", booked: 68, total: 90, rate: 76 },
      { doctor_id: "s2", doctor_name: "د. رنا العلي", booked: 46, total: 75, rate: 61 },
    ],
  },
  waitlist: { current_count: 9, cancellation_fill_rate: 54 },
  demand_heatmap: Array.from({ length: 7 }).flatMap((_, d) =>
    [9, 10, 11, 12, 13, 16, 17, 18].map((h) => ({
      day_of_week: d,
      hour: h,
      count: Math.max(0, Math.round(7 * Math.sin((h - 8) / 3.2) + ((d + h) % 4))),
    })),
  ),
};

/** URL -> payload. Checked in order; the first pattern that matches wins. */
const ROUTES: [RegExp, unknown][] = [
  [/\/setup\/status/, { initialized: true }],
  [/\/auth\/me|\/me$/, { id: "s4", full_name: "د. محمد النور", role: "admin", permissions: ["*"] }],
  [/\/branches/, branches],
  [/\/specialties/, specialties],
  [/\/staff\/directory/, staff.map((s) => ({ id: s.id, full_name: s.full_name, role: s.role, specialty_id: s.specialty_id }))],
  [/\/staff/, staff],
  [/\/services/, services],
  [/\/appointments\/visit-types/, [
    { id: "v1", code: "in_person", name_ar: "حضوري", name: "In person" },
    { id: "v2", code: "video", name_ar: "زيارة عن بعد", name: "Video" },
  ]],
  [/\/appointments/, appointments],
  [/\/patients\/duplicates|\/patient-duplicates/, []],
  [/\/patients/, { items: patients, total: patients.length }],
  [/\/payments\/methods|\/payment-methods/, [
    { id: "pm1", branch_id: "b1", method_type: "mobile_cash", display_name: "محفظة زين كاش", account_number: "0790000000", is_active: true },
  ]],
  [/\/payments/, payments],
  [/\/conversations\/attention-count/, { count: 2 }],
  [/\/conversations/, conversations],
  [/\/queues\/[^/]+\/tickets/, queueTickets],
  [/\/queues/, queues],
  [/\/queue-tickets/, queueTickets[0]],
  [/\/reception\/desk/, {
    date: iso(0, 0).slice(0, 10),
    branch_id: "b1",
    branch_timezone: "Asia/Amman",
    arrivals: deskArrivals,
    expected_count: deskArrivals.length,
    checked_in_count: 3,
    waiting_count: 1,
    in_progress_count: 1,
    done_count: 1,
    needs_attention_count: 2,
  }],
  [/\/me\/branches/, branches],
  [/\/me\/queue/, {
    date: iso(0, 0).slice(0, 10),
    queues: [{ id: "q-b1-s1", branch_id: "b1", branch_name: "فرع الرابية", branch_timezone: "Asia/Amman", queue_date: iso(0, 0).slice(0, 10), tickets: myTickets }],
    waiting_count: 2,
    in_progress_count: 1,
    done_count: 1,
  }],
  [/\/me\/calendar/, {
    date: iso(0, 0).slice(0, 10),
    branch_ids: ["b1"],
    appointments: myAppointments,
    slots: Array.from({ length: 4 }).map((_, i) => ({
      id: `msl${i + 1}`,
      branch_id: "b1",
      branch_name: "فرع الرابية",
      branch_timezone: "Asia/Amman",
      start_at: iso(0, 14 + i),
      end_at: iso(0, 14 + i, 30),
      duration_minutes: 30,
      status: "available",
      service_name: services[i % services.length].name,
    })),
  }],
  [/\/me\/services/, services.map((sv, i) => ({
    id: sv.id,
    name: sv.name,
    description: sv.description,
    duration_minutes: sv.duration_minutes,
    price: sv.price,
    is_active: true,
    specialty_name: i === 2 ? "جلدية" : "أسنان",
    upcoming_appointments: 12 - i * 3,
  }))],
  [/\/me\/patients/, patients.slice(0, 6).map((p, i) => ({
    id: p.id,
    full_name: p.full_name,
    phone: p.phone,
    email: p.email || null,
    date_of_birth: p.date_of_birth,
    gender: null,
    notes: p.notes || null,
    tags: p.tags,
    visits_count: 3 + i,
    last_visit_at: iso(-7 - i, 11),
    next_appointment_at: i < 3 ? iso(1 + i, 10) : null,
  }))],
  [/\/me\/today/, {
    date: iso(0, 0).slice(0, 10),
    now_serving: myTickets[2],
    up_next: myTickets[0],
    waiting_count: 2,
    appointments: myAppointments,
    remaining_appointments: 3,
    completed_appointments: 2,
    conversations: conversations.slice(0, 3).map((c) => ({
      id: c.id,
      patient_name: c.patient_name,
      last_message_preview: c.last_message_preview,
      last_message_at: c.last_message_at,
      needs_attention: c.needs_attention,
      channel_type: "whatsapp",
    })),
    needs_attention_count: 2,
  }],
  [/\/me\/leaves/, []],
  [/\/staff\/me\/telegram-link/, { linked: false, link_url: "https://t.me/clinic_bot?start=demo", bot_username: "clinic_bot" }],
  [/\/settings\/staff-bot/, { bot_token_set: true, bot_username: "clinic_alerts_bot", is_active: true }],
  [/\/settings\/ai-providers/, { provider: "gemini", model: "gemini-2.0-flash", temperature: 0.4, is_active: true, fallback_provider: null, api_key_set: true }],
  [/\/notifications\/schedules/, [
    { id: "n1", kind: "appointment_reminder", channel: "whatsapp", offset_hours: -24, template: "تذكير: عندك موعد بكرا الساعة {time} في {branch}.", is_active: true },
    { id: "n2", kind: "post_visit_review", channel: "whatsapp", offset_hours: 3, template: "كيف كانت زيارتك اليوم؟ رأيك بيهمنا.", is_active: true },
  ]],
  [/\/escalation-staff/, staff.slice(0, 3).map((s, i) => ({
    staff_id: s.id,
    full_name: s.full_name,
    role: s.role,
    receives: i === 0 ? "medical" : "admin",
    telegram_linked: i < 2,
    open_conversations: i,
  }))],
  [/\/cancellation-policies/, [
    { id: "cp1", scope: "branch", branch_id: "b1", staff_id: null, service_id: null, window_hours: 12, fee_type: "percent", fee_value: 50, no_show_fee_type: "fixed", no_show_fee_value: 10, is_active: true },
  ]],
  [/\/channels\/provider-types/, [
    { value: "whatsapp", label: "واتساب", providers: ["meta", "twilio"] },
    { value: "telegram", label: "تيليجرام", providers: ["telegram"] },
  ]],
  [/\/channels\/[^/]+\/health/, { ok: true, checked_at: iso(0, 9), details: "الاتصال سليم" }],
  [/\/invoices/, [
    { id: "inv1", invoice_number: "INV-2041", appointment_id: "a1", patient_name: patients[0].full_name, total: 45, currency: "د.أ", issued_at: iso(-1, 12), status: "issued" },
  ]],
  [/\/doctor-availability/, [
    { id: "da1", staff_id: "s1", branch_id: "b1", weekday: 0, start_time: "09:00", end_time: "17:00", is_active: true },
    { id: "da2", staff_id: "s1", branch_id: "b1", weekday: 1, start_time: "09:00", end_time: "17:00", is_active: true },
  ]],
  [/\/branch-holidays/, []],
  [/\/imports\/data-types/, [{ value: "patients", label: "المرضى" }, { value: "appointments", label: "المواعيد" }]],
  [/\/imports\/jobs/, []],
  [/\/imports\/profiles/, []],
  [/\/waitlist/, patients.slice(0, 4).map((p, i) => ({
    id: `w${i + 1}`,
    patient_id: p.id,
    patient_name: p.full_name,
    branch_id: "b1",
    staff_id: i % 2 ? "s2" : "s1",
    service_id: "sv1",
    status: "waiting",
    priority: i === 0 ? "high" : "normal",
    preferred_from: iso(1, 9),
    preferred_to: iso(3, 17),
    created_at: iso(-2, 10),
    notes: "",
  }))],
  [/\/recalls/, patients.slice(0, 3).map((p, i) => ({
    id: `r${i + 1}`,
    patient_id: p.id,
    patient_name: p.full_name,
    due_at: iso(2 + i, 10),
    status: "pending",
    reason: "مراجعة دورية",
    service_id: "sv1",
    branch_id: "b1",
    created_at: iso(-10, 9),
  }))],
  [/\/packages\/patient|\/patient-packages/, [
    { id: "pk1", patient_id: "p1", patient_name: patients[0].full_name, package_id: "pkg1", package_name: "باقة 5 جلسات ليزر", sessions_total: 5, sessions_used: 3, sessions_remaining: 2, status: "active", expires_at: iso(2, 20), created_at: iso(-40, 10) },
  ]],
  [/\/packages/, [
    { id: "pkg1", name: "باقة 5 جلسات ليزر", branch_id: "b2", service_id: "sv3", sessions: 5, price: 380, currency: "د.أ", validity_days: 120, is_active: true },
  ]],
  [/\/coupons/, [
    { id: "c1", code: "WELCOME20", discount_type: "percent", discount_value: 20, is_active: true, usage_limit: 100, used_count: 12, per_patient_limit: 1, valid_until: iso(90, 23), branch_id: null, service_ids: [], patient_tag: null },
  ]],
  [/\/channels/, [
    { id: "ch1", branch_id: "b1", channel_type: "whatsapp", display_name: "واتساب العيادة", identifier: "+96279 000 0000", is_active: true, status: "connected", provider: "meta" },
  ]],
  [/\/reports\/dashboard/, dashboard],
  [/\/reports\/weekly/, {
    period: { date_from: iso(-7, 0), date_to: iso(0, 23) },
    appointments: dashboard.appointments,
    financial: dashboard.financial,
    ai_chat: dashboard.ai_chat,
    top_services: dashboard.breakdown.by_service,
  }],
  [/\/slots/, Array.from({ length: 6 }).map((_, i) => ({
    id: `sl${i + 1}`,
    branch_id: "b1",
    staff_id: i % 2 ? "s2" : "s1",
    service_id: "sv1",
    start_at: iso(1 + Math.floor(i / 3), 9 + i),
    end_at: iso(1 + Math.floor(i / 3), 9 + i, 30),
    status: "available",
    capacity: 1,
    booked_count: 0,
  }))],
  [/\/holidays/, []],
  [/\/settings\/ai|\/ai-settings/, { provider: "gemini", model: "gemini-2.0-flash", temperature: 0.4, system_prompt: "", is_active: true, fallback_provider: null }],
  [/\/settings/, {
    clinic_name: "عيادة النور",
    general_info: "نقبل تأمين كذا وكذا، الدفع كاش أو بطاقة، يوجد موقف سيارات.",
    min_lead_minutes: 60,
    max_advance_days: 30,
    cancellation_window_hours: 12,
    reminder_hours_before: 24,
    currency: "د.أ",
  }],
  [/\/imports/, []],
  [/\/alerts/, []],
];

function payloadFor(url: string) {
  for (const [pattern, payload] of ROUTES) if (pattern.test(url)) return payload;
  return [];
}

export const mockAdapter: AxiosAdapter = (config) =>
  new Promise<AxiosResponse>((resolve) => {
    const url = `${config.baseURL ?? ""}${config.url ?? ""}`;
    const method = (config.method ?? "get").toLowerCase();
    // Writes echo their own body back, with an id, so a created row appears in
    // the list it was submitted from.
    const body =
      method === "get"
        ? payloadFor(url)
        : { id: `new-${Math.random().toString(36).slice(2, 8)}`, ...(typeof config.data === "string" ? JSON.parse(config.data || "{}") : {}) };
    // A short delay keeps the loading states visible -- they are part of the
    // design being previewed.
    setTimeout(
      () =>
        resolve({
          data: body,
          status: 200,
          statusText: "OK",
          headers: {},
          config,
        } as AxiosResponse),
      220,
    );
  });
