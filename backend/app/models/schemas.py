from datetime import date, datetime, time
from typing import Literal
from uuid import UUID

from pydantic import BaseModel

AppointmentStatus = Literal[
    "draft", "requested", "pending_review", "pending_approval", "pending_payment",
    "pending_insurance_verification", "pending_prior_authorization",
    "confirmed", "patient_confirmed", "waitlisted", "rescheduled",
    "checked_in", "arrived_late", "waiting", "called", "in_consultation",
    "procedure_started", "completed", "checked_out",
    "cancelled", "cancelled_by_patient", "cancelled_by_clinic", "cancelled_by_doctor",
    "rejected", "no_show", "expired", "on_hold",
]
StaffRole = Literal["admin", "doctor", "receptionist"]
ChannelType = Literal["whatsapp", "telegram", "instagram", "messenger", "twilio", "web"]
ConversationMode = Literal["ai", "human"]
MessageDirection = Literal["inbound", "outbound"]
MessageSender = Literal["patient", "ai", "staff"]


class Branch(BaseModel):
    id: UUID
    name: str
    address: str | None = None
    phone: str | None = None
    timezone: str = "Asia/Amman"
    working_hours_note: str | None = None
    is_active: bool = True


class BranchCreate(BaseModel):
    name: str
    address: str | None = None
    phone: str | None = None
    timezone: str = "Asia/Amman"
    working_hours_note: str | None = None


class BranchUpdate(BaseModel):
    name: str | None = None
    address: str | None = None
    phone: str | None = None
    timezone: str | None = None
    working_hours_note: str | None = None
    is_active: bool | None = None


class Patient(BaseModel):
    id: UUID
    full_name: str
    phone: str
    email: str | None = None
    date_of_birth: date | None = None
    gender: str | None = None
    notes: str | None = None
    is_merged_into: UUID | None = None


class GuardianCreate(BaseModel):
    full_name: str
    phone: str | None = None
    email: str | None = None


class Guardian(BaseModel):
    id: UUID
    full_name: str
    phone: str | None = None
    email: str | None = None


class PatientCreate(BaseModel):
    full_name: str
    phone: str
    email: str | None = None
    date_of_birth: date | None = None
    gender: str | None = None
    notes: str | None = None
    guardian: GuardianCreate | None = None


class PatientUpdate(BaseModel):
    full_name: str | None = None
    phone: str | None = None
    email: str | None = None
    date_of_birth: date | None = None
    gender: str | None = None
    notes: str | None = None


class PatientGuardianAttach(BaseModel):
    guardian_id: UUID | None = None
    guardian: GuardianCreate | None = None
    relationship: str | None = None
    is_primary: bool = False


class PatientGuardianLink(BaseModel):
    patient_id: UUID
    guardian_id: UUID
    relationship: str | None = None
    is_primary: bool = False
    guardian_full_name: str | None = None
    guardian_phone: str | None = None


DuplicateStatus = Literal["pending", "confirmed_duplicate", "not_duplicate"]


class PatientDuplicate(BaseModel):
    id: UUID
    patient_a_id: UUID
    patient_b_id: UUID
    match_score: float
    match_reasons: list[str]
    status: DuplicateStatus
    reviewed_by: UUID | None = None
    reviewed_at: datetime | None = None
    created_at: datetime
    patient_a_name: str | None = None
    patient_a_phone: str | None = None
    patient_b_name: str | None = None
    patient_b_phone: str | None = None


class PatientCreateResult(BaseModel):
    patient: Patient
    potential_duplicates: list[PatientDuplicate] = []


class MergePatientsRequest(BaseModel):
    survivor_id: UUID


PatientTagValue = Literal[
    "new", "existing", "vip", "corporate", "self_pay", "chronic", "high_risk", "frequent_no_show", "blacklisted"
]


class PatientTag(BaseModel):
    patient_id: UUID
    tag: PatientTagValue
    tagged_by: UUID | None = None
    tagged_at: datetime


class PatientTagRequest(BaseModel):
    tag: PatientTagValue


class Specialty(BaseModel):
    id: UUID
    department_id: UUID | None = None
    name_ar: str
    name_en: str
    is_active: bool = True


class SpecialtyCreate(BaseModel):
    department_id: UUID | None = None
    name_ar: str
    name_en: str


ApprovalRequirement = Literal["none", "doctor", "admin", "previous_visit"]
PatientGenderRestriction = Literal["male", "female"]


class Service(BaseModel):
    id: UUID
    name: str
    description: str | None = None
    duration_minutes: int = 30
    price: float | None = None
    specialty_id: UUID | None = None
    is_active: bool = True
    doctor_ids: list[UUID] = []
    deposit_amount: float | None = None
    prep_instructions: str | None = None
    required_documents: str | None = None
    min_age: int | None = None
    patient_gender_restriction: PatientGenderRestriction | None = None
    approval_requirement: ApprovalRequirement = "none"


class ServiceCreate(BaseModel):
    name: str
    description: str | None = None
    duration_minutes: int = 30
    price: float | None = None
    specialty_id: UUID | None = None
    doctor_ids: list[UUID] = []
    deposit_amount: float | None = None
    prep_instructions: str | None = None
    required_documents: str | None = None
    min_age: int | None = None
    patient_gender_restriction: PatientGenderRestriction | None = None
    approval_requirement: ApprovalRequirement = "none"


class ServiceUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    duration_minutes: int | None = None
    price: float | None = None
    specialty_id: UUID | None = None
    is_active: bool | None = None
    deposit_amount: float | None = None
    prep_instructions: str | None = None
    required_documents: str | None = None
    min_age: int | None = None
    patient_gender_restriction: PatientGenderRestriction | None = None
    approval_requirement: ApprovalRequirement | None = None


class Staff(BaseModel):
    id: UUID
    full_name: str
    email: str
    phone: str | None = None
    role: StaffRole
    specialty: str | None = None
    is_active: bool = True
    branch_ids: list[UUID] = []
    specialty_ids: list[UUID] = []
    service_ids: list[UUID] = []
    telegram_linked: bool = False


class StaffScheduleBlock(BaseModel):
    """A quick, single working-hours block applied to every selected day at
    creation time — the common case of one uniform schedule. Anything more
    irregular (different hours per day, multiple blocks) is edited afterward
    from the doctor's schedule panel, which supports arbitrary per-day rows."""

    days: list[int] = []
    start_time: time
    end_time: time
    slot_duration_minutes: int = 30


class StaffCreate(BaseModel):
    full_name: str
    email: str
    phone: str | None = None
    role: StaffRole
    specialty: str | None = None
    branch_ids: list[UUID] = []
    specialty_ids: list[UUID] = []
    service_ids: list[UUID] = []
    schedule: StaffScheduleBlock | None = None


class StaffUpdate(BaseModel):
    full_name: str | None = None
    phone: str | None = None
    role: StaffRole | None = None
    specialty: str | None = None
    is_active: bool | None = None


class DoctorAvailability(BaseModel):
    id: UUID
    staff_id: UUID
    branch_id: UUID
    day_of_week: int
    start_time: time
    end_time: time
    slot_duration_minutes: int = 30
    is_active: bool = True


class DoctorAvailabilityCreate(BaseModel):
    staff_id: UUID
    branch_id: UUID
    day_of_week: int
    start_time: time
    end_time: time
    slot_duration_minutes: int = 30


class DoctorSubstitute(BaseModel):
    id: UUID
    staff_id: UUID
    substitute_staff_id: UUID
    branch_id: UUID | None = None
    start_at: datetime
    end_at: datetime


class DoctorSubstituteCreate(BaseModel):
    staff_id: UUID
    substitute_staff_id: UUID
    # Null means the arrangement covers the absent doctor at every branch.
    branch_id: UUID | None = None
    start_at: datetime
    end_at: datetime


class DoctorLimits(BaseModel):
    staff_id: UUID
    max_patients_per_day: int | None = None
    max_consecutive_minutes: int | None = None
    buffer_before_minutes: int | None = None
    buffer_after_minutes: int | None = None
    break_start_time: time | None = None
    break_end_time: time | None = None


class DoctorLimitsUpdate(BaseModel):
    max_patients_per_day: int | None = None
    max_consecutive_minutes: int | None = None
    buffer_before_minutes: int | None = None
    buffer_after_minutes: int | None = None
    break_start_time: time | None = None
    break_end_time: time | None = None


class BranchHoliday(BaseModel):
    id: UUID
    branch_id: UUID
    holiday_date: date
    reason: str | None = None
    is_full_day: bool = True
    start_time: time | None = None
    end_time: time | None = None


class BranchHolidayCreate(BaseModel):
    branch_id: UUID
    holiday_date: date
    reason: str | None = None
    is_full_day: bool = True
    # Only read when is_full_day is false -- a half-day closure (an afternoon
    # off for a national event) rather than the whole day.
    start_time: time | None = None
    end_time: time | None = None


class BranchHolidayResult(BaseModel):
    holiday: BranchHoliday
    # How many already-generated slots this closure took off the market, so
    # the person declaring it sees the real impact instead of guessing.
    blocked_slots: int


SlotStatus = Literal[
    "available", "temporarily_held", "booked", "blocked",
    "unavailable", "reserved", "overbooked", "waitlist_only",
]


class Slot(BaseModel):
    id: UUID
    branch_id: UUID
    doctor_id: UUID | None = None
    service_id: UUID | None = None
    room_id: UUID | None = None
    resource_id: UUID | None = None
    start_at: datetime
    end_at: datetime
    duration_minutes: int
    status: SlotStatus
    held_until: datetime | None = None
    internal_only: bool = False


class SlotGenerateRequest(BaseModel):
    staff_id: UUID
    branch_id: UUID
    from_date: date
    to_date: date


class SlotGenerateResult(BaseModel):
    created: int
    # Why nothing was created, when nothing was. None on a successful run.
    reason: str | None = None


class SlotHoldRequest(BaseModel):
    session_id: str
    hold_minutes: int = 10


class SlotReleaseRequest(BaseModel):
    session_id: str


class SlotBookRequest(BaseModel):
    patient_id: UUID
    session_id: str
    notes: str | None = None
    source: str = "dashboard"
    service_id: UUID | None = None
    patient_package_id: UUID | None = None


class SlotBookResult(BaseModel):
    appointment_id: UUID


class VisitType(BaseModel):
    id: UUID
    code: str
    name_ar: str
    name_en: str
    is_active: bool = True


class AppointmentCreate(BaseModel):
    branch_id: UUID
    patient_id: UUID
    staff_id: UUID | None = None
    service_id: UUID | None = None
    scheduled_at: datetime
    duration_minutes: int = 30
    source: str = "dashboard"
    notes: str | None = None
    reason_for_visit: str | None = None
    priority: Literal["normal", "urgent", "emergency"] = "normal"
    # FR-BKG-009 (visit mode: in-person/telemedicine/home visit) and
    # FR-BKT-016 (booking from a referral) -- both already had columns on
    # `appointments` with nothing in the API ever setting them.
    visit_type_id: UUID | None = None
    referral_source: str | None = None
    room_id: UUID | None = None


class Appointment(AppointmentCreate):
    id: UUID
    status: AppointmentStatus = "requested"
    created_at: datetime
    updated_at: datetime
    appointment_number: str | None = None
    confirmation_code: str | None = None
    confirmation_status: Literal["pending", "confirmed", "declined"] = "pending"
    payment_status: Literal["unpaid", "pending", "paid", "refunded", "partial"] = "unpaid"
    cancellation_reason: str | None = None
    rescheduling_reason: str | None = None
    queue_number: int | None = None
    check_in_time: datetime | None = None
    consultation_start_time: datetime | None = None
    completion_time: datetime | None = None
    no_show_flag: bool = False
    slot_id: UUID | None = None
    patient_package_id: UUID | None = None
    # Server-generated (see create_appointment / create_linked_appointments) --
    # never client-set on a single booking.
    meeting_link: str | None = None
    recurrence_id: UUID | None = None
    parent_appointment_id: UUID | None = None


# FR-BKT-009/010/011/012/013/014: group sessions, family-sequential bookings,
# multi-service visits, plain sequential appointments, recurring appointments,
# and screening campaigns are all the same underlying shape -- several
# appointments created together, sharing a recurrence_id, that differ only in
# how their times are laid out. One endpoint with a `link_mode` covers all six
# instead of a bespoke table and screen per booking "type" the spec names.
class BulkBookingItem(BaseModel):
    patient_id: UUID
    service_id: UUID | None = None
    staff_id: UUID | None = None
    duration_minutes: int | None = None
    reason_for_visit: str | None = None
    notes: str | None = None


BulkBookingLinkMode = Literal["sequential", "same_time", "recurring_weekly", "recurring_biweekly", "recurring_monthly"]


class BulkBookingRequest(BaseModel):
    branch_id: UUID
    link_mode: BulkBookingLinkMode
    start_at: datetime
    items: list[BulkBookingItem]
    # recurring_* modes repeat `items[0]` this many times instead of reading
    # further entries from `items` (a recurring series is one patient/service,
    # not a list of different people).
    occurrences: int | None = None
    visit_type_id: UUID | None = None
    # Tag for FR-BKT-014 (screening campaign) -- prefixed onto each booking's
    # notes so it's visible on the appointment without a new campaigns table.
    campaign_name: str | None = None


class BulkBookingResultItem(BaseModel):
    ok: bool
    appointment: Appointment | None = None
    error: str | None = None


class BulkBookingResult(BaseModel):
    recurrence_id: UUID
    results: list[BulkBookingResultItem]


class AppointmentStatusUpdate(BaseModel):
    status: AppointmentStatus
    reason: str | None = None
    changed_by: UUID | None = None


class SlotSearchResult(BaseModel):
    matches: list[Slot]
    nearest: Slot | None = None
    alternative_branches: list[Slot] = []
    alternative_doctors: list[Slot] = []


class RescheduleRequest(BaseModel):
    new_slot_id: UUID
    session_id: str
    reason: str | None = None


class CancelRequest(BaseModel):
    reason: str
    cancelled_by: Literal["patient", "clinic", "doctor"] = "clinic"


class CancelResult(BaseModel):
    appointment: Appointment
    fee_charged: float = 0
    refunded: float = 0


class BulkCancelRequest(BaseModel):
    branch_id: UUID | None = None
    doctor_id: UUID | None = None
    date_from: datetime
    date_to: datetime
    reason: str


class BulkCancelResult(BaseModel):
    cancelled_count: int


class DoctorAbsenceRequest(BaseModel):
    doctor_id: UUID
    branch_id: UUID | None = None
    date_from: datetime
    date_to: datetime
    reason: str


class DoctorAbsenceResult(BaseModel):
    total_affected: int
    reassigned_count: int
    cancelled_count: int
    substitute_staff_id: UUID | None = None


class MarkNoShowRequest(BaseModel):
    reason: str | None = None
    override_grace_period: bool = False


class NoShowRateItem(BaseModel):
    key: str
    total: int
    no_show: int
    rate: float


FeeType = Literal["none", "fixed", "percentage"]


class CancellationPolicy(BaseModel):
    id: UUID
    branch_id: UUID | None = None
    service_id: UUID | None = None
    doctor_id: UUID | None = None
    hours_before_threshold: int = 24
    cancellation_fee_type: FeeType = "none"
    cancellation_fee_value: float = 0
    no_show_fee_type: FeeType = "none"
    no_show_fee_value: float = 0
    is_active: bool = True


class CancellationPolicyCreate(BaseModel):
    branch_id: UUID | None = None
    service_id: UUID | None = None
    doctor_id: UUID | None = None
    hours_before_threshold: int = 24
    cancellation_fee_type: FeeType = "none"
    cancellation_fee_value: float = 0
    no_show_fee_type: FeeType = "none"
    no_show_fee_value: float = 0


class CancellationPolicyUpdate(BaseModel):
    hours_before_threshold: int | None = None
    cancellation_fee_type: FeeType | None = None
    cancellation_fee_value: float | None = None
    no_show_fee_type: FeeType | None = None
    no_show_fee_value: float | None = None
    is_active: bool | None = None


WaitlistStatus = Literal["active", "offered", "booked", "expired", "cancelled"]


class WaitlistEntry(BaseModel):
    id: UUID
    patient_id: UUID
    branch_id: UUID
    doctor_id: UUID | None = None
    service_id: UUID | None = None
    preferred_days: list[int] | None = None
    preferred_time_window: str | None = None
    max_wait_days: int | None = None
    accepts_alternative_doctor: bool = True
    accepts_alternative_branch: bool = False
    medical_priority: int = 0
    status: WaitlistStatus = "active"
    created_at: datetime


class WaitlistCreate(BaseModel):
    patient_id: UUID
    branch_id: UUID
    doctor_id: UUID | None = None
    service_id: UUID | None = None
    preferred_days: list[int] | None = None
    preferred_time_window: str | None = None
    max_wait_days: int | None = None
    accepts_alternative_doctor: bool = True
    accepts_alternative_branch: bool = False
    medical_priority: int = 0


class WaitlistUpdate(BaseModel):
    status: WaitlistStatus | None = None
    medical_priority: int | None = None


class WaitlistOffer(BaseModel):
    id: UUID
    waitlist_id: UUID
    slot_id: UUID
    offered_at: datetime
    expires_at: datetime
    response: Literal["accepted", "declined", "expired"] | None = None
    responded_at: datetime | None = None


class WaitlistOfferAcceptResult(BaseModel):
    appointment_id: UUID


QueueTicketStatus = Literal["waiting", "called", "in_progress", "done", "skipped"]
ArrivalStatus = Literal["early", "on_time", "late", "very_late"]
PriorityLevel = Literal["normal", "emergency", "elderly", "special_needs", "child", "critical", "vip"]


class Queue(BaseModel):
    id: UUID
    branch_id: UUID
    doctor_id: UUID | None = None
    room_id: UUID | None = None
    service_id: UUID | None = None
    queue_date: date
    is_active: bool = True


class CheckInRequest(BaseModel):
    room_id: UUID | None = None
    priority_level: PriorityLevel = "normal"


class CheckInByCodeRequest(BaseModel):
    confirmation_code: str
    priority_level: PriorityLevel = "normal"


TriageLevel = Literal["non_urgent", "urgent", "emergency"]


class QueueTicket(BaseModel):
    id: UUID
    queue_id: UUID
    appointment_id: UUID
    patient_id: UUID
    ticket_number: int
    priority_level: PriorityLevel
    status: QueueTicketStatus
    arrival_status: ArrivalStatus | None = None
    checked_in_at: datetime
    called_at: datetime | None = None
    started_at: datetime | None = None
    ended_at: datetime | None = None
    estimated_entry_time: datetime | None = None
    is_walk_in: bool = False
    triage_level: TriageLevel | None = None
    triage_notes: str | None = None
    triaged_by: UUID | None = None
    triaged_at: datetime | None = None


class CheckInResult(BaseModel):
    appointment: Appointment
    ticket: QueueTicket


class QueueTicketUpdate(BaseModel):
    priority_level: PriorityLevel | None = None
    queue_id: UUID | None = None


class TriageRequest(BaseModel):
    triage_level: TriageLevel
    triage_notes: str | None = None


class WalkInRequest(BaseModel):
    branch_id: UUID
    patient_id: UUID
    doctor_id: UUID | None = None
    service_id: UUID | None = None
    priority_level: PriorityLevel = "normal"
    notes: str | None = None


class WalkInResult(BaseModel):
    appointment: Appointment
    ticket: QueueTicket
    matched_available_slot: bool
    bumped_ticket_count: int = 0
    emergency_notice: str | None = None


class Channel(BaseModel):
    """Staff-facing channel shape — n8n is an internal transport detail and
    never appears here (no workflow id, no webhook url)."""

    id: UUID
    branch_id: UUID
    channel_type: ChannelType
    display_name: str
    identifier: str
    is_active: bool = True
    token_expires_at: datetime | None = None
    masked_credentials: dict = {}
    created_at: datetime


class ChannelCreate(BaseModel):
    branch_id: UUID
    channel_type: ChannelType
    display_name: str
    credentials: dict = {}


class ChannelUpdate(BaseModel):
    display_name: str | None = None
    branch_id: UUID | None = None
    is_active: bool | None = None


class VerifyCredentialsRequest(BaseModel):
    channel_type: ChannelType
    credentials: dict = {}


class VerifyCredentialsResult(BaseModel):
    valid: bool
    details: dict = {}
    error: str | None = None


class RotateCredentialsRequest(BaseModel):
    credentials: dict


class TestMessageRequest(BaseModel):
    recipient: str
    message: str = "رسالة اختبار من نظام العيادة — تجاهلها."


class TestMessageResult(BaseModel):
    sent: bool
    error: str | None = None


ChannelHealthStatus = Literal["healthy", "degraded", "failed", "not_connected"]


class ChannelHealthCheck(BaseModel):
    id: UUID
    channel_id: UUID
    checked_at: datetime
    status: ChannelHealthStatus
    token_valid: bool | None = None
    webhook_registered: bool | None = None
    last_inbound_at: datetime | None = None
    last_outbound_at: datetime | None = None
    error_code: str | None = None
    error_message: str | None = None


ChannelAiMode = Literal["full_booking", "inquiry_only", "greeting_only"]


class ChannelSettings(BaseModel):
    channel_id: UUID
    ai_enabled: bool = True
    ai_mode: ChannelAiMode = "full_booking"
    greeting_message: str | None = None
    outside_hours_message: str | None = None
    working_hours: dict = {}
    auto_reply_outside_hours: bool = True
    escalation_keywords: list[str] = []
    max_ai_turns_before_human: int = 10
    language: str = "ar"
    dialect: str | None = None
    tone: Literal["friendly", "formal"] | None = None
    handoff_message: str | None = None
    updated_at: datetime


class ChannelSettingsUpdate(BaseModel):
    ai_enabled: bool | None = None
    ai_mode: ChannelAiMode | None = None
    greeting_message: str | None = None
    outside_hours_message: str | None = None
    working_hours: dict | None = None
    auto_reply_outside_hours: bool | None = None
    escalation_keywords: list[str] | None = None
    max_ai_turns_before_human: int | None = None
    language: str | None = None
    dialect: str | None = None
    tone: Literal["friendly", "formal"] | None = None
    handoff_message: str | None = None


RoutingRuleAction = Literal["assign_branch", "escalate", "auto_reply"]


class RoutingRule(BaseModel):
    id: UUID
    channel_id: UUID
    keyword: str
    action: RoutingRuleAction
    target_branch_id: UUID | None = None
    auto_reply_text: str | None = None
    priority: int = 0
    is_active: bool = True


class RoutingRuleCreate(BaseModel):
    keyword: str
    action: RoutingRuleAction
    target_branch_id: UUID | None = None
    auto_reply_text: str | None = None
    priority: int = 0


class InboundMessage(BaseModel):
    channel_id: UUID
    message: str
    # Legacy shape, still sent by the live n8n workflows — patient_phone is
    # sometimes a synthetic "tg:{chat_id}" value, not a real phone number.
    patient_phone: str | None = None
    patient_name: str | None = None
    # Preferred shape going forward (PLUTO-COMPLETION-PROMPT.md 1.1) — set
    # these directly once a channel's n8n workflow is updated to send them.
    external_user_id: str | None = None
    provider_type: str | None = None
    display_name: str | None = None
    # Set when n8n already uploaded an inbound photo/file to storage before
    # calling this endpoint — media_type="image" triggers an attempt to
    # attach it to the patient's pending payment as a receipt, but only for a
    # human-handled conversation (mode=human). An AI-handled one defers that
    # call to ai-services' submit_payment_receipt tool instead, which only
    # fires after Gemini vision has already ruled the photo isn't medical —
    # this endpoint has no way to look at what the photo actually shows.
    media_url: str | None = None
    media_type: str | None = None


class InboundMessageResult(BaseModel):
    conversation_id: UUID
    patient_id: UUID | None = None
    mode: ConversationMode


class Message(BaseModel):
    id: UUID
    conversation_id: UUID
    direction: MessageDirection
    sender_type: MessageSender
    content: str
    media_url: str | None = None
    media_type: str | None = None
    created_at: datetime


class ConversationSummary(BaseModel):
    id: UUID
    channel_id: UUID
    channel_type: ChannelType
    branch_id: UUID
    patient_id: UUID
    patient_name: str
    patient_phone: str
    status: str
    mode: ConversationMode
    needs_attention: bool
    assigned_staff_id: UUID | None = None
    last_message_at: datetime | None = None
    last_message_preview: str | None = None


class ConversationDetail(ConversationSummary):
    messages: list[Message]


class ConversationUpdate(BaseModel):
    mode: ConversationMode | None = None
    needs_attention: bool | None = None
    assigned_staff_id: UUID | None = None
    status: str | None = None


class StaffReplyCreate(BaseModel):
    message: str


class ClinicSettings(BaseModel):
    id: UUID
    clinic_name: str
    about_text: str
    min_booking_lead_minutes: int
    max_booking_advance_days: int
    same_day_cutoff_time: time | None = None
    # Hold new bookings at pending_payment until the deposit is verified,
    # instead of confirming them outright. Off by default.
    require_deposit_to_confirm: bool = False
    # Clinic-wide fallback; services.deposit_amount wins where it is set.
    default_deposit_amount: float | None = None
    updated_at: datetime


class ClinicSettingsUpdate(BaseModel):
    clinic_name: str | None = None
    about_text: str | None = None
    min_booking_lead_minutes: int | None = None
    max_booking_advance_days: int | None = None
    same_day_cutoff_time: time | None = None
    require_deposit_to_confirm: bool | None = None
    default_deposit_amount: float | None = None


class AiProviderSettings(BaseModel):
    id: UUID
    openai_api_key_masked: str | None = None
    gemini_api_key_masked: str | None = None
    gemini_model: str | None = None
    updated_at: datetime


class AiProviderSettingsUpdate(BaseModel):
    # Omit a field to leave it unchanged; pass "" to clear it (falls back to
    # the OPENAI_API_KEY/GEMINI_API_KEY env var again).
    openai_api_key: str | None = None
    gemini_api_key: str | None = None
    gemini_model: str | None = None


PaymentMethodType = Literal["mobile_cash", "bank_transfer", "cash", "other"]
PaymentStatus = Literal["pending", "receipt_submitted", "verified", "rejected", "refunded", "partially_refunded"]
PaymentType = Literal["deposit", "full", "balance", "package", "cancellation_fee"]


class PaymentMethod(BaseModel):
    id: UUID
    branch_id: UUID | None = None
    method_type: PaymentMethodType
    display_name: str
    account_number: str | None = None
    is_active: bool = True


class PaymentMethodCreate(BaseModel):
    branch_id: UUID | None = None
    method_type: PaymentMethodType
    display_name: str
    account_number: str | None = None


class Payment(BaseModel):
    id: UUID
    appointment_id: UUID | None = None
    patient_id: UUID
    amount: float
    currency: str | None = None
    method: PaymentMethodType | None = None
    status: PaymentStatus
    payment_type: PaymentType = "full"
    transaction_reference: str | None = None
    coupon_id: UUID | None = None
    patient_package_id: UUID | None = None
    receipt_image_url: str | None = None
    submitted_at: datetime | None = None
    verified_by: UUID | None = None
    verified_at: datetime | None = None
    rejection_reason: str | None = None
    notes: str | None = None
    created_at: datetime


class PaymentWithDetails(Payment):
    patient_name: str | None = None
    patient_phone: str | None = None
    appointment_number: str | None = None
    scheduled_at: datetime | None = None
    branch_id: UUID | None = None


class PaymentReceiptSubmit(BaseModel):
    receipt_image_url: str


class PaymentRejectRequest(BaseModel):
    reason: str


class RefundRequest(BaseModel):
    amount: float
    reason: str


class Refund(BaseModel):
    id: UUID
    payment_id: UUID
    amount: float
    reason: str
    processed_by: UUID | None = None
    processed_at: datetime


class ApplyCouponRequest(BaseModel):
    code: str


class Package(BaseModel):
    id: UUID
    name: str
    service_ids: list[UUID] = []
    sessions_count: int
    price: float
    validity_days: int = 365
    is_active: bool = True


class PackageCreate(BaseModel):
    name: str
    service_ids: list[UUID] = []
    sessions_count: int
    price: float
    validity_days: int = 365


class PackageUpdate(BaseModel):
    name: str | None = None
    price: float | None = None
    is_active: bool | None = None


PatientPackageStatus = Literal["pending_payment", "active", "cancelled", "expired"]


class PatientPackage(BaseModel):
    id: UUID
    patient_id: UUID
    package_id: UUID
    branch_id: UUID
    sessions_remaining: int
    status: PatientPackageStatus
    purchased_at: datetime
    expires_at: datetime


class PatientPackageSell(BaseModel):
    patient_id: UUID
    package_id: UUID
    branch_id: UUID


CouponDiscountType = Literal["fixed", "percentage", "free_session", "free_consultation", "service_upgrade"]
CouponCustomerScope = Literal["all", "new", "existing"]


class Coupon(BaseModel):
    id: UUID
    code: str
    discount_type: CouponDiscountType
    discount_value: float | None = None
    valid_from: datetime | None = None
    valid_to: datetime | None = None
    max_uses: int | None = None
    used_count: int = 0
    is_active: bool = True
    branch_id: UUID | None = None
    service_id: UUID | None = None
    # Services this coupon is limited to. Empty means every service. Replaces
    # the single service_id above, which stays only for coupons created before
    # the group table existed.
    service_ids: list[UUID] = []
    customer_scope: CouponCustomerScope = "all"
    per_customer_limit: int | None = None


class CouponCreate(BaseModel):
    code: str
    discount_type: CouponDiscountType
    discount_value: float | None = None
    valid_from: datetime | None = None
    valid_to: datetime | None = None
    max_uses: int | None = None
    branch_id: UUID | None = None
    service_ids: list[UUID] = []
    customer_scope: CouponCustomerScope = "all"
    per_customer_limit: int | None = None


class CouponUpdate(BaseModel):
    is_active: bool | None = None
    service_ids: list[UUID] | None = None


class Invoice(BaseModel):
    id: UUID
    appointment_id: UUID | None = None
    patient_id: UUID
    invoice_number: str
    subtotal: float
    discount: float = 0
    total: float
    issued_at: datetime
    issued_by: UUID | None = None


class InvoiceCreate(BaseModel):
    appointment_id: UUID
    discount: float = 0


class LoginRequest(BaseModel):
    email: str
    password: str


class LoginResult(BaseModel):
    access_token: str | None = None
    mfa_required: bool = False
    mfa_token: str | None = None
    staff: "StaffMe | None" = None


class MfaVerifyRequest(BaseModel):
    mfa_token: str
    code: str


class MfaSetupResult(BaseModel):
    secret: str
    otpauth_url: str
    # Rendered server-side as a data: URI. The alternative is a QR library in
    # the browser for the one screen that needs it, and the backend already
    # has `qrcode` for appointment check-in codes.
    qr_data_uri: str


class MfaConfirmRequest(BaseModel):
    code: str


class ChangePasswordRequest(BaseModel):
    old_password: str
    new_password: str


class SetPasswordRequest(BaseModel):
    new_password: str


class StaffBotSettings(BaseModel):
    """The one clinic-wide bot, admin-configured (settings/staff_bot_settings.py)."""

    configured: bool
    username: str | None = None


class StaffBotTokenUpdate(BaseModel):
    token: str


class TelegramLinkStatus(BaseModel):
    """A single staff member's own link state against the shared bot."""

    linked: bool
    bot_username: str | None = None


class TelegramLinkCode(BaseModel):
    code: str
    bot_username: str | None = None
    expires_at: datetime


EscalationCategory = Literal["medical", "administrative"]


class EscalationStaffMember(BaseModel):
    id: UUID
    staff_id: UUID
    staff_name: str | None = None
    branch_id: UUID | None = None
    is_active: bool = True
    # None = infer from the staff member's role (doctor -> medical, everyone
    # else -> administrative), which is what makes routing work unconfigured.
    handles: EscalationCategory | None = None


class EscalationStaffCreate(BaseModel):
    staff_id: UUID
    branch_id: UUID | None = None
    handles: EscalationCategory | None = None


class StaffMe(BaseModel):
    id: UUID
    full_name: str
    email: str
    role: StaffRole
    mfa_enabled: bool
    permissions: list[str]


class SetupStatus(BaseModel):
    initialized: bool


class SetupBranch(BaseModel):
    name: str
    address: str | None = None
    working_hours_note: str | None = None


class SetupAdmin(BaseModel):
    full_name: str
    email: str
    phone: str | None = None
    password: str


class SetupRequest(BaseModel):
    clinic_name: str
    branch: SetupBranch
    admin: SetupAdmin


class SetupResult(BaseModel):
    branch_id: UUID
    admin_staff_id: UUID


ImportDataType = Literal["patients", "services", "staff", "appointments"]
ImportSourceType = Literal["file", "google_sheets", "postgres", "sqlserver"]


class ImportFieldInfo(BaseModel):
    name: str
    label: str
    required: bool
    kind: str


class SourcePreviewRequest(BaseModel):
    data_type: ImportDataType
    source_type: ImportSourceType
    spreadsheet_id: str | None = None
    sheet_tab: str | None = None
    service_account_json: str | None = None
    connection_string: str | None = None
    table_name: str | None = None


class SourcePreviewResult(BaseModel):
    columns: list[str]
    sample_rows: list[dict]
    rows: list[dict]
    suggested_mapping: dict[str, str | None]
    available_tabs: list[str] = []
    available_tables: list[str] = []


class ScanPromptsRequest(BaseModel):
    data_type: ImportDataType
    rows: list[dict]
    column_mapping: dict[str, str | None]
    options: dict = {}


class DryRunRequest(BaseModel):
    data_type: ImportDataType
    source_type: ImportSourceType
    source_label: str | None = None
    branch_id: UUID | None = None
    rows: list[dict]
    column_mapping: dict[str, str | None]
    options: dict = {}
    profile_id: UUID | None = None


class ImportJobRowOut(BaseModel):
    row_number: int
    action: str
    reason: str | None = None
    entity_id: UUID | None = None
    raw_data: dict


class ImportJob(BaseModel):
    id: UUID
    profile_id: UUID | None = None
    data_type: str
    source_type: str
    source_label: str | None = None
    branch_id: UUID | None = None
    status: str
    will_create: int
    will_update: int
    will_skip: int
    will_error: int
    created_count: int
    updated_count: int
    skipped_count: int
    error_count: int
    total_rows: int
    processed_count: int
    undo_status: str
    undo_deadline: datetime | None = None
    error_message: str | None = None
    created_at: datetime
    completed_at: datetime | None = None


class DryRunResult(BaseModel):
    job: ImportJob
    rows: list[ImportJobRowOut]


class UndoResult(BaseModel):
    undone: bool
    reason: str | None = None
    blocking: list[dict] = []


class ImportProfileCreate(BaseModel):
    name: str
    data_type: ImportDataType
    source_type: ImportSourceType
    branch_id: UUID | None = None
    column_mapping: dict[str, str | None]
    options: dict = {}
    source_config: dict = {}
    credentials: dict | None = None
    sync_interval_hours: int | None = None


class ImportProfile(BaseModel):
    id: UUID
    name: str
    data_type: str
    source_type: str
    branch_id: UUID | None = None
    column_mapping: dict[str, str | None]
    options: dict
    source_config: dict
    sync_interval_hours: int | None = None
    next_sync_at: datetime | None = None
    last_synced_at: datetime | None = None
    last_sync_status: str | None = None
    last_sync_error: str | None = None


RecallReasonType = Literal["specific_date", "after_days", "medical_result", "treatment_plan", "vaccination", "periodic_checkup"]
RecallStatus = Literal["pending", "invited", "responded", "booked", "escalated", "cancelled"]


class RecallCreate(BaseModel):
    patient_id: UUID
    branch_id: UUID
    doctor_id: UUID | None = None
    service_id: UUID | None = None
    due_date: date
    reason_type: RecallReasonType
    reason_notes: str | None = None


class Recall(BaseModel):
    id: UUID
    patient_id: UUID
    branch_id: UUID
    doctor_id: UUID | None = None
    service_id: UUID | None = None
    source_appointment_id: UUID | None = None
    due_date: date
    reason_type: RecallReasonType
    reason_notes: str | None = None
    status: RecallStatus
    invited_at: datetime | None = None
    responded_at: datetime | None = None
    escalated_at: datetime | None = None
    resulting_appointment_id: UUID | None = None
    created_by: UUID | None = None
    created_at: datetime


# --- /me workspace views -----------------------------------------------------
# Fully-resolved read models for a staff member's own workspace. Names are
# joined server-side on purpose: the doctor screens used to assemble these
# client-side from /branches, /staff and /patients — lookups a doctor has no
# permission for — so one 403 took the whole page down. Anything these models
# carry, the caller can already see by permission plus ownership.


class MyQueueTicket(BaseModel):
    id: UUID
    ticket_number: int
    status: QueueTicketStatus
    priority_level: PriorityLevel
    arrival_status: ArrivalStatus | None = None
    patient_id: UUID
    patient_name: str
    patient_phone: str | None = None
    appointment_id: UUID
    checked_in_at: datetime
    called_at: datetime | None = None
    started_at: datetime | None = None
    ended_at: datetime | None = None
    estimated_entry_time: datetime | None = None


class MyQueue(BaseModel):
    id: UUID
    branch_id: UUID
    branch_name: str
    branch_timezone: str
    queue_date: date
    tickets: list[MyQueueTicket] = []


class MyQueueDay(BaseModel):
    date: date
    queues: list[MyQueue] = []
    waiting_count: int = 0
    in_progress_count: int = 0
    done_count: int = 0


class MyCalendarAppointment(BaseModel):
    id: UUID
    scheduled_at: datetime
    duration_minutes: int
    status: AppointmentStatus
    patient_id: UUID
    patient_name: str
    patient_phone: str | None = None
    service_name: str | None = None
    branch_id: UUID
    branch_name: str
    branch_timezone: str
    reason_for_visit: str | None = None
    queue_number: int | None = None
    check_in_time: datetime | None = None
    slot_id: UUID | None = None


class MyCalendarSlot(BaseModel):
    id: UUID
    branch_id: UUID
    branch_name: str
    branch_timezone: str
    start_at: datetime
    end_at: datetime
    duration_minutes: int
    status: SlotStatus
    service_name: str | None = None


class MyCalendarDay(BaseModel):
    date: date
    branch_ids: list[UUID] = []
    appointments: list[MyCalendarAppointment] = []
    slots: list[MyCalendarSlot] = []


class MyService(BaseModel):
    id: UUID
    name: str
    description: str | None = None
    duration_minutes: int
    price: float | None = None
    is_active: bool
    specialty_name: str | None = None
    upcoming_appointments: int = 0


class MyPatient(BaseModel):
    id: UUID
    full_name: str
    phone: str
    email: str | None = None
    date_of_birth: date | None = None
    gender: str | None = None
    notes: str | None = None
    tags: list[PatientTagValue] = []
    visits_count: int = 0
    last_visit_at: datetime | None = None
    next_appointment_at: datetime | None = None


class SearchPatientResult(BaseModel):
    id: UUID
    full_name: str
    phone: str | None = None


class SearchAppointmentResult(BaseModel):
    id: UUID
    scheduled_at: datetime
    status: AppointmentStatus
    patient_name: str
    branch_id: UUID


class SearchStaffResult(BaseModel):
    id: UUID
    full_name: str
    role: StaffRole


class SearchResults(BaseModel):
    patients: list[SearchPatientResult] = []
    appointments: list[SearchAppointmentResult] = []
    staff: list[SearchStaffResult] = []


class MyTodayConversation(BaseModel):
    id: UUID
    patient_name: str
    last_message_preview: str | None = None
    last_message_at: datetime | None = None
    needs_attention: bool = False
    channel_type: str


class MyToday(BaseModel):
    """One request behind the landing screen. Assembled server-side because
    four round trips on first paint is what makes a dashboard feel slow, and
    because each part needs a different permission — absent ones come back
    empty rather than failing the whole screen."""

    date: date
    now_serving: MyQueueTicket | None = None
    up_next: MyQueueTicket | None = None
    waiting_count: int = 0
    appointments: list[MyCalendarAppointment] = []
    remaining_appointments: int = 0
    completed_appointments: int = 0
    conversations: list[MyTodayConversation] = []
    needs_attention_count: int = 0


LeaveType = Literal["planned", "emergency"]


class MyLeaveCreate(BaseModel):
    start_at: datetime
    end_at: datetime
    reason: str | None = None
    leave_type: LeaveType = "planned"


class ConflictingAppointment(BaseModel):
    id: UUID
    scheduled_at: datetime
    patient_name: str
    patient_phone: str | None = None
    status: AppointmentStatus


class MyLeave(BaseModel):
    id: UUID
    start_at: datetime
    end_at: datetime
    reason: str | None = None
    leave_type: LeaveType
    created_at: datetime
    slots_blocked: int = 0
    # Appointments already booked inside the window. Filing leave doesn't
    # cancel them — that needs appointment.cancel and a human deciding whether
    # to reschedule or hand them to a substitute — so they're surfaced here
    # instead of silently left for someone to discover on the day.
    conflicts: list[ConflictingAppointment] = []


# --- reception front desk ----------------------------------------------------


class DeskArrival(BaseModel):
    appointment_id: UUID
    scheduled_at: datetime
    duration_minutes: int
    status: AppointmentStatus
    patient_id: UUID
    patient_name: str
    patient_phone: str | None = None
    doctor_name: str | None = None
    service_name: str | None = None
    confirmation_code: str | None = None
    checked_in: bool = False
    ticket_number: int | None = None
    queue_status: QueueTicketStatus | None = None


class ReceptionDesk(BaseModel):
    """Everything the front desk needs for one branch on one day, in one call.

    The desk's whole job is the check-in loop, and doing it from the
    appointments table meant hunting a row, then a second screen for the queue
    it fed. Both sides live here together."""

    date: date
    branch_id: UUID | None = None
    branch_timezone: str | None = None
    arrivals: list[DeskArrival] = []
    expected_count: int = 0
    checked_in_count: int = 0
    waiting_count: int = 0
    in_progress_count: int = 0
    done_count: int = 0
    needs_attention_count: int = 0

class NotificationTemplate(BaseModel):
    id: UUID
    code: str
    channel_type: str
    language: str
    subject: str | None = None
    body_template: str
    is_active: bool


class NotificationTemplateUpdate(BaseModel):
    body_template: str | None = None
    is_active: bool | None = None


class NotificationSchedule(BaseModel):
    id: UUID
    template_id: UUID
    trigger_type: str
    # Sign carries meaning, not just magnitude: before_appointment schedules
    # are always negative (minutes before scheduled_at), after_appointment
    # always positive -- see services/notifications.get_due_reminders.
    offset_minutes: int | None = None
    status_trigger: str | None = None
    is_active: bool
    template: NotificationTemplate


class NotificationScheduleUpdate(BaseModel):
    offset_minutes: int | None = None
    is_active: bool | None = None


class StaffDirectoryEntry(BaseModel):
    """A colleague's name, for screens that have to show or pick one.

    Deliberately not `Staff`: no email, phone, branch assignments, specialty
    links or Telegram state. Those are staff *records* and stay behind
    staff.view. Who works here and what they do is the org chart, which every
    signed-in colleague can already see by walking down the corridor.
    """

    id: UUID
    full_name: str
    role: StaffRole
    is_active: bool = True


class PatientListItem(Patient):
    """A patient as the list renders them. `tags` rides along because fetching
    them per row was one browser request per patient."""

    tags: list[PatientTagValue] = []


class PatientPage(BaseModel):
    """A page of patients plus the unfiltered total.

    Every list endpoint used to return the whole table. That is fine at 74
    patients and impossible at 74,000 — and the scoping that fed it shipped
    every visible id through the URL, which breaks far earlier than that.
    """

    items: list[PatientListItem] = []
    total: int = 0
    limit: int
    offset: int
