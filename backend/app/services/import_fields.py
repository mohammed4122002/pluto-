"""Canonical field definitions per importable data type — the single source
of truth for what the column-mapping step offers, what's required, and what
counts as a plausible source-column name for auto-suggestion. Extracted and
generalized from the previous per-entity import endpoints so the same
matching behavior (e.g. patients keyed by phone) carries over exactly."""

DATA_TYPES = ("patients", "services", "staff", "appointments")

FieldDef = dict


def _f(label: str, required: bool = False, synonyms: set[str] | None = None, kind: str = "text") -> FieldDef:
    return {"label": label, "required": required, "synonyms": synonyms or set(), "kind": kind}


FIELD_DEFINITIONS: dict[str, dict[str, FieldDef]] = {
    "patients": {
        "full_name": _f("الاسم الكامل", required=True, synonyms={"full_name", "name", "patient_name", "الاسم", "اسم المريض", "الاسم الكامل"}),
        "phone": _f("رقم الهاتف", required=True, synonyms={"phone", "mobile", "phone_number", "رقم الهاتف", "الهاتف", "رقم الجوال", "الجوال"}),
        "email": _f("البريد الإلكتروني", synonyms={"email", "e-mail", "الايميل", "البريد الالكتروني", "البريد"}),
        "date_of_birth": _f("تاريخ الميلاد", synonyms={"date_of_birth", "dob", "birth_date", "تاريخ الميلاد"}, kind="date"),
        "gender": _f("الجنس", synonyms={"gender", "sex", "الجنس"}),
        "notes": _f("ملاحظات", synonyms={"notes", "note", "ملاحظات"}),
    },
    "services": {
        "name": _f("اسم الخدمة", required=True, synonyms={"name", "service", "service_name", "الاسم", "اسم الخدمة", "الخدمة"}),
        "description": _f("الوصف", synonyms={"description", "desc", "الوصف"}),
        "duration_minutes": _f("المدة (دقائق)", synonyms={"duration", "duration_minutes", "المدة", "مدة"}, kind="number"),
        "price": _f("السعر", synonyms={"price", "cost", "السعر", "التكلفة"}, kind="number"),
    },
    "staff": {
        "full_name": _f("الاسم", required=True, synonyms={"full_name", "name", "employee_name", "الاسم", "اسم الموظف"}),
        "role": _f("الدور / التخصص", synonyms={"role", "title", "position", "specialty", "الدور", "المسمى الوظيفي", "التخصص"}),
        "phone": _f("الهاتف", synonyms={"phone", "mobile", "phone_number", "رقم الهاتف", "الهاتف"}),
        "email": _f("البريد الإلكتروني", synonyms={"email", "e-mail", "الايميل", "البريد الالكتروني"}),
        "active": _f("نشط؟", synonyms={"active", "is_active", "نشط", "فعال"}, kind="bool"),
        "work_start": _f("بداية الدوام", synonyms={"work_start", "start_time", "بداية الدوام"}),
        "work_end": _f("نهاية الدوام", synonyms={"work_end", "end_time", "نهاية الدوام"}),
        "working_days": _f("أيام الدوام", synonyms={"working_days", "days", "أيام الدوام"}),
    },
    "appointments": {
        "patient_name": _f("اسم المريض", synonyms={"patient_name", "name", "اسم المريض", "الاسم"}),
        "patient_phone": _f("رقم هاتف المريض", required=True, synonyms={"patient_phone", "phone", "رقم الهاتف", "الهاتف"}),
        "appointment_time": _f("وقت الموعد", required=True, synonyms={"appointment_time", "scheduled_at", "time", "موعد", "وقت الموعد"}, kind="datetime"),
        "duration_minutes": _f("المدة (دقائق)", synonyms={"duration", "duration_minutes", "المدة", "مدة"}, kind="number"),
        "status": _f("الحالة", synonyms={"status", "الحالة"}),
        "notes": _f("ملاحظات", synonyms={"notes", "note", "ملاحظات"}),
    },
}

# The field used to decide "does this row already exist" — configurable by
# the user for patients/services/staff; appointments use a fixed composite
# rule (same patient + same time) since there is no natural single key.
DEFAULT_MATCH_KEY: dict[str, str] = {
    "patients": "phone",
    "services": "name",
    "staff": "email",
    "appointments": "patient_phone",
}

MATCH_KEY_OPTIONS: dict[str, list[str]] = {
    "patients": ["phone", "full_name"],
    "services": ["name"],
    "staff": ["email", "phone"],
    "appointments": ["patient_phone"],
}

STATUS_MAP = {
    "scheduled": "confirmed",
    "confirmed": "confirmed",
    "requested": "requested",
    "completed": "completed",
    "no_show": "no_show",
    "no-show": "no_show",
    "cancelled": "cancelled",
    "canceled": "cancelled",
    "checked_in": "checked_in",
}

DAY_NAME_TO_INDEX = {
    "sunday": 0, "monday": 1, "tuesday": 2, "wednesday": 3, "thursday": 4, "friday": 5, "saturday": 6,
    "الأحد": 0, "الاثنين": 1, "الثلاثاء": 2, "الأربعاء": 3, "الخميس": 4, "الجمعة": 5, "السبت": 6,
}
