"""Full-conversation scenarios driven through _execute_tool, the same entry
point the model's tool calls actually go through.

Every other test in this suite checks one function or one prompt rule in
isolation. This one walks whole patient journeys -- pick a branch, browse
services, find times, register, book, look up, cancel -- against a fake DB
seeded to mirror the real clinic's shape (multi-branch, per-branch doctor/
service assignments, a slots table), so that a regression in how the steps
fit *together* is caught even when each step's own test still passes.

It covers, in one place, the behaviours that were each reported live and
fixed separately:
  - booking completes with no confirmation-code step in between
  - the same patient can't be booked into two overlapping appointments,
    unless the second is explicitly for someone else
  - cancelling releases the slot back to 'available' for the next patient
  - switching branches mid-conversation actually changes what gets searched
  - a service not offered at this branch names only branches that do offer it
"""

import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest  # noqa: E402

from app.routers.chat import _execute_tool  # noqa: E402

# --- fake supabase -----------------------------------------------------------


class _Query:
    def __init__(self, table, db=None):
        self._table = table
        self._db = db
        self._rows = list(table.rows)
        self._op = None
        self._payload = None
        self._select = ""
        self._order_col = None
        self._order_desc = False

    def select(self, *columns, **_k):
        self._select = ", ".join(str(c) for c in columns)
        return self

    def eq(self, column, value):
        self._rows = [r for r in self._rows if r.get(column) == value]
        return self

    def neq(self, column, value):
        self._rows = [r for r in self._rows if r.get(column) != value]
        return self

    def is_(self, column, value):
        target = None if value == "null" else value
        self._rows = [r for r in self._rows if r.get(column) == target]
        return self

    def in_(self, column, values):
        values = set(values)
        self._rows = [r for r in self._rows if r.get(column) in values]
        return self

    def gte(self, column, value):
        self._rows = [r for r in self._rows if (r.get(column) or "") >= value]
        return self

    def gt(self, column, value):
        self._rows = [r for r in self._rows if (r.get(column) or "") > value]
        return self

    def lt(self, column, value):
        self._rows = [r for r in self._rows if (r.get(column) or "") < value]
        return self

    def lte(self, column, value):
        self._rows = [r for r in self._rows if (r.get(column) or "") <= value]
        return self

    def or_(self, expression):
        """PostgREST's or= filter, for the "this branch or clinic-wide"
        lookups cancellation policies and payment methods both use."""
        def matches(row, clause):
            column, op, value = clause.split(".", 2)
            if op == "eq":
                return str(row.get(column)) == value
            if op == "is":
                return row.get(column) is None if value == "null" else row.get(column) == value
            raise AssertionError(f"unsupported or_ operator: {op}")

        clauses = expression.split(",")
        self._rows = [r for r in self._rows if any(matches(r, c) for c in clauses)]
        return self

    def order(self, column, desc=False, **_k):
        self._order_col = column
        self._order_desc = desc
        return self

    def limit(self, n):
        self._rows = self._sorted()[:n]
        return self

    def single(self):
        return self

    def insert(self, values):
        self._op = "insert"
        self._payload = values
        return self

    def update(self, values):
        self._op = "update"
        self._payload = values
        return self

    def delete(self):
        self._op = "delete"
        return self

    def _sorted(self):
        if not self._order_col:
            return self._rows
        return sorted(self._rows, key=lambda r: (r.get(self._order_col) is None, r.get(self._order_col) or ""),
                      reverse=self._order_desc)

    # PostgREST resolves "staff!fk(...)" / "services(...)" embeds server-side.
    # Doing it here too keeps the fixtures to plain flat rows -- otherwise
    # every slot and appointment would have to carry a hand-copied duplicate
    # of its doctor's and service's fields, which drift the moment a test
    # changes one of them.
    _EMBEDS = {
        "slots": {"staff": "doctor_id", "services": "service_id"},
        "appointments": {"staff": "staff_id", "services": "service_id", "patients": "patient_id"},
        "payments": {"appointments": "appointment_id", "patients": "patient_id"},
    }

    def _embedded(self, rows):
        wanted = self._EMBEDS.get(self._table.name)
        if not wanted or self._db is None:
            return rows
        out = []
        for row in rows:
            row = dict(row)
            for embed, fk in wanted.items():
                if embed in row or embed not in self._select:
                    continue
                target_id = row.get(fk)
                target = next(
                    (t for t in self._db.tables.get(embed, _Table(embed)).rows if t.get("id") == target_id), None
                )
                row[embed] = dict(target) if target else None
            out.append(row)
        return out

    def execute(self):
        if self._op == "insert":
            payload = self._payload if isinstance(self._payload, list) else [self._payload]
            created = []
            for values in payload:
                row = dict(values)
                row.setdefault("id", f"{self._table.name}-{len(self._table.rows) + 1}")
                row.setdefault("created_at", datetime.now(timezone.utc).isoformat())
                self._table.rows.append(row)
                created.append(row)
            return _Result(created)
        if self._op == "update":
            ids = {id(r) for r in self._rows}
            touched = []
            for row in self._table.rows:
                if id(row) in ids:
                    row.update(self._payload)
                    touched.append(row)
            return _Result(touched)
        if self._op == "delete":
            ids = {id(r) for r in self._rows}
            self._table.rows[:] = [r for r in self._table.rows if id(r) not in ids]
            return _Result([])
        return _Result(self._embedded(self._sorted()))


class _Result:
    def __init__(self, data):
        self.data = data


class _Table:
    def __init__(self, name, rows=None):
        self.name = name
        self.rows = rows or []


class _Db:
    """Fake supabase client. book_slot is implemented to mirror the real
    plpgsql function in db/migrations/0011_slots_engine.sql: refuses a slot
    that isn't available, flips it to 'booked', and inserts the appointment
    from the slot's own branch/doctor/time."""

    def __init__(self, tables):
        self.tables = {name: _Table(name, rows) for name, rows in tables.items()}

    def table(self, name):
        if name not in self.tables:
            self.tables[name] = _Table(name, [])
        return _Query(self.tables[name], self)

    def rpc(self, fn, params):
        assert fn == "book_slot", fn
        slot = next((s for s in self.tables["slots"].rows if s["id"] == params["p_slot_id"]), None)
        if slot is None:
            raise AssertionError("book_slot called with an unknown slot id")
        if slot["status"] != "available":
            raise AssertionError("book_slot called on a slot that isn't available")
        slot["status"] = "booked"
        appt = {
            "id": f"appt-{len(self.tables['appointments'].rows) + 1}",
            "branch_id": slot["branch_id"],
            "patient_id": params["p_patient_id"],
            "staff_id": slot["doctor_id"],
            "service_id": slot.get("service_id"),
            "scheduled_at": slot["start_at"],
            "duration_minutes": slot["duration_minutes"],
            "status": "requested",
            "source": params["p_source"],
            "notes": params.get("p_notes"),
            "slot_id": slot["id"],
            "deleted_at": None,
            "paid_amount": 0,
        }
        self.tables["appointments"].rows.append(appt)
        return _Rpc(appt["id"])


class _Rpc:
    def __init__(self, data):
        self._data = data

    def execute(self):
        return _Result(self._data)


# --- clinic fixture, shaped like the real one --------------------------------

AMMAN = "branch-amman"
IRBID = "branch-irbid"
AQABA = "branch-aqaba"

SARA = "staff-sara"       # dermatology, Amman
NOUR = "staff-nour"       # laser, Amman
LAMA = "staff-lama"       # pediatrics, Irbid only

SVC_DERMA = "svc-derma"
SVC_LASER = "svc-laser"
SVC_PEDS = "svc-peds"

CONVERSATION = "conv-1"
PATIENT = "patient-1"

# Far enough out to clear the booking-window checks, and stable within a run.
DAY = (datetime.now(timezone.utc) + timedelta(days=3)).replace(hour=6, minute=0, second=0, microsecond=0)


def _slot(slot_id, branch, doctor, start, minutes=30):
    return {
        "id": slot_id,
        "branch_id": branch,
        "doctor_id": doctor,
        "service_id": None,
        "status": "available",
        "start_at": start.isoformat(),
        "end_at": (start + timedelta(minutes=minutes)).isoformat(),
        "duration_minutes": minutes,
    }


def _tables():
    return {
        "branches": [
            {"id": AMMAN, "name": "عيادة بلوتو - عمّان", "address": "عمّان", "phone": None,
             "working_hours_note": None, "timezone": "Asia/Amman", "currency": "JOD", "is_active": True},
            {"id": IRBID, "name": "عيادة بلوتو - إربد", "address": "إربد", "phone": None,
             "working_hours_note": None, "timezone": "Asia/Amman", "currency": "JOD", "is_active": True},
            {"id": AQABA, "name": "عيادة بلوتو - العقبة", "address": "العقبة", "phone": None,
             "working_hours_note": None, "timezone": "Asia/Amman", "currency": "JOD", "is_active": True},
        ],
        "conversations": [{"id": CONVERSATION, "branch_id": None, "ai_episode_started_at": None}],
        "clinic_settings": [{
            "clinic_name": "عيادة بلوتو", "about_text": "",
            "min_booking_lead_minutes": 0, "max_booking_advance_days": 90, "same_day_cutoff_time": None,
            "require_deposit_to_confirm": False, "default_deposit_amount": None,
        }],
        "services": [
            {"id": SVC_DERMA, "name": "كشفية جلدية عام", "description": "", "price": 25, "duration_minutes": 30,
             "specialty_id": None, "specialties": None, "is_active": True, "deleted_at": None},
            {"id": SVC_LASER, "name": "جلسة ليزر إزالة شعر", "description": "", "price": 35, "duration_minutes": 30,
             "specialty_id": None, "specialties": None, "is_active": True, "deleted_at": None},
            {"id": SVC_PEDS, "name": "كشفية أطفال", "description": "", "price": 20, "duration_minutes": 20,
             "specialty_id": None, "specialties": None, "is_active": True, "deleted_at": None},
        ],
        "service_doctors": [
            {"service_id": SVC_DERMA, "staff_id": SARA},
            {"service_id": SVC_LASER, "staff_id": NOUR},
            {"service_id": SVC_PEDS, "staff_id": LAMA},
        ],
        "staff": [
            {"id": SARA, "full_name": "د. سارة الخطيب", "role": "doctor", "is_active": True,
             "availability_status": "available", "gender": "female", "languages": ["ar"],
             "qualification": "ماجستير جلدية", "years_experience": 8, "doctor_specialties": []},
            {"id": NOUR, "full_name": "د. نور الحوراني", "role": "doctor", "is_active": True,
             "availability_status": "available", "gender": "female", "languages": ["ar"],
             "qualification": "تجميل وليزر", "years_experience": 6, "doctor_specialties": []},
            {"id": LAMA, "full_name": "د. لمى الرفاعي", "role": "doctor", "is_active": True,
             "availability_status": "available", "gender": "female", "languages": ["ar"],
             "qualification": "بورد أطفال", "years_experience": 10, "doctor_specialties": []},
        ],
        "staff_branches": [
            {"staff_id": SARA, "branch_id": AMMAN},
            {"staff_id": NOUR, "branch_id": AMMAN},
            {"staff_id": LAMA, "branch_id": IRBID},
        ],
        "slots": [
            _slot("slot-sara-9", AMMAN, SARA, DAY),
            _slot("slot-sara-10", AMMAN, SARA, DAY + timedelta(hours=1)),
            _slot("slot-nour-9", AMMAN, NOUR, DAY),
            _slot("slot-lama-9", IRBID, LAMA, DAY, minutes=20),
        ],
        "patients": [{"id": PATIENT, "full_name": "tg:555", "phone": "tg:555", "date_of_birth": None,
                      "is_merged_into": None}],
        "appointments": [],
        "status_transitions": [
            {"from_status": "requested", "to_status": "confirmed"},
            {"from_status": "confirmed", "to_status": "cancelled_by_patient"},
            {"from_status": "requested", "to_status": "cancelled_by_patient"},
        ],
        "appointment_status_history": [],
        "payments": [],
        "cancellation_policies": [],
        "recalls": [],
        "packages": [],
        "patient_packages": [],
        "coupons": [],
        "notification_log": [],
    }


@pytest.fixture
def db():
    return _Db(_tables())


@pytest.fixture
def ctx():
    return {
        "conversation_id": CONVERSATION,
        "branch_id": AMMAN,
        "patient_id": PATIENT,
        "booking_enabled": True,
        "patient_said": "مريم أحمد سالم 0790000000 بدي احجز",
        "last_patient_message": "بدي احجز",
        "cancel_confirmation_asked": True,
    }


def _register(db, ctx):
    return _execute_tool(db, ctx, "save_contact_info", {
        "full_name": "مريم أحمد سالم", "phone": "0790000000", "age": 0,
    })


def _next_turn(ctx):
    """A fresh patient message. The per-turn bookkeeping _execute_tool leaves
    on ctx (what it booked, what it quoted) is scoped to one turn in
    generate_reply, so a test that books and then cancels has to cross that
    boundary the same way a real conversation does -- otherwise it trips the
    deliberate "can't book and cancel in one turn" guard."""
    for key in ("_booked_appointment_id", "_booked_appointment_number", "_quoted_appointment_numbers",
                "_contact_rejected_this_turn", "_listed_appointment_ids"):
        ctx.pop(key, None)
    return ctx


def _book(db, ctx, doctor, start, service="", visit_for=""):
    return _execute_tool(db, ctx, "book_appointment", {
        "doctor_name": doctor,
        "start_at": start,
        "visit_for_name": visit_for,
        "reason_for_visit": "",
        "service_name": service,
        "use_patient_package_id": "",
    })


# --- scenario 1: the whole happy path ---------------------------------------


def test_a_patient_can_go_from_branch_choice_to_a_confirmed_booking(db, ctx):
    ctx["branch_id"] = None
    assert _execute_tool(db, ctx, "select_branch", {"branch_name": "عيادة بلوتو - عمّان"}) == {"selected": True}
    assert ctx["branch_id"] == AMMAN

    services = _execute_tool(db, ctx, "list_services", {"query": ""})["services"]
    assert {s["name"] for s in services} == {"كشفية جلدية عام", "جلسة ليزر إزالة شعر"}

    slots = _execute_tool(db, ctx, "find_available_slots", {
        "doctor_name": "", "specialty_query": "", "service_name": "كشفية جلدية عام",
        "doctor_gender": "", "doctor_language": "", "max_price": 0, "date_from": "", "date_to": "",
    })["slots"]
    assert slots, "the dermatologist's own slots must be offered for her own service"
    assert all(s["doctor_name"] == "د. سارة الخطيب" for s in slots)

    assert _register(db, ctx)["saved"] is True

    result = _book(db, ctx, "د. سارة الخطيب", slots[0]["start_at_clinic_local_time"], "كشفية جلدية عام")
    assert result["booked"] is True
    assert result["appointment_number"]

    booked = db.tables["appointments"].rows
    assert len(booked) == 1
    assert booked[0]["patient_id"] == PATIENT
    slot = next(s for s in db.tables["slots"].rows if s["id"] == "slot-sara-9")
    assert slot["status"] == "booked"


def test_booking_needs_no_confirmation_code_step(db, ctx):
    # The OTP gate used to reject book_appointment outright unless a code had
    # been verified in the last 15 minutes; nothing here sends or verifies one.
    _register(db, ctx)
    assert _book(db, ctx, "د. سارة الخطيب", DAY.isoformat(), "كشفية جلدية عام")["booked"] is True


def test_booking_is_refused_until_a_real_name_and_phone_are_on_file(db, ctx):
    # Patient row still holds the synthetic tg: placeholders.
    result = _book(db, ctx, "د. سارة الخطيب", DAY.isoformat(), "كشفية جلدية عام")
    assert "error" in result
    assert not db.tables["appointments"].rows


# --- scenario 2: one patient, two overlapping appointments -------------------


def test_a_second_overlapping_appointment_with_another_doctor_is_refused(db, ctx):
    _register(db, ctx)
    assert _book(db, ctx, "د. سارة الخطيب", DAY.isoformat(), "كشفية جلدية عام")["booked"] is True

    second = _book(db, ctx, "د. نور الحوراني", DAY.isoformat(), "جلسة ليزر إزالة شعر")
    assert second["booked"] is False
    assert "سارة الخطيب" in second["reason"]
    assert len(db.tables["appointments"].rows) == 1
    assert next(s for s in db.tables["slots"].rows if s["id"] == "slot-nour-9")["status"] == "available"


def test_the_same_patient_can_still_book_a_different_hour(db, ctx):
    _register(db, ctx)
    assert _book(db, ctx, "د. سارة الخطيب", DAY.isoformat(), "كشفية جلدية عام")["booked"] is True
    later = (DAY + timedelta(hours=1)).isoformat()
    assert _book(db, ctx, "د. سارة الخطيب", later, "كشفية جلدية عام")["booked"] is True
    assert len(db.tables["appointments"].rows) == 2


def test_an_overlapping_booking_for_someone_else_is_allowed(db, ctx):
    _register(db, ctx)
    assert _book(db, ctx, "د. سارة الخطيب", DAY.isoformat(), "كشفية جلدية عام")["booked"] is True

    for_son = _book(db, ctx, "د. نور الحوراني", DAY.isoformat(), "جلسة ليزر إزالة شعر",
                    visit_for="سامي أحمد سالم")
    assert for_son["booked"] is True
    assert len(db.tables["appointments"].rows) == 2


# --- scenario 3: cancelling frees the slot ----------------------------------


def test_cancelling_releases_the_slot_back_to_available(db, ctx):
    _register(db, ctx)
    _book(db, ctx, "د. سارة الخطيب", DAY.isoformat(), "كشفية جلدية عام")
    appt = db.tables["appointments"].rows[0]
    appt["status"] = "confirmed"

    _next_turn(ctx)
    listed = _execute_tool(db, ctx, "find_my_appointments", {})["appointments"]
    assert len(listed) == 1
    appointment_id = listed[0]["appointment_id"]

    result = _execute_tool(db, ctx, "cancel_appointment", {
        "appointment_id": appointment_id, "reason": "ظرف طارئ",
    })
    assert "error" not in result

    assert appt["status"] == "cancelled_by_patient"
    assert appt["cancellation_reason"] == "ظرف طارئ"
    assert next(s for s in db.tables["slots"].rows if s["id"] == "slot-sara-9")["status"] == "available"


def test_a_released_slot_is_offered_to_the_next_search(db, ctx):
    _register(db, ctx)
    _book(db, ctx, "د. سارة الخطيب", DAY.isoformat(), "كشفية جلدية عام")
    db.tables["appointments"].rows[0]["status"] = "confirmed"

    def open_times():
        return {
            s["start_at_clinic_local_time"]
            for s in _execute_tool(db, ctx, "find_available_slots", {
                "doctor_name": "د. سارة الخطيب", "specialty_query": "", "service_name": "",
                "doctor_gender": "", "doctor_language": "", "max_price": 0, "date_from": "", "date_to": "",
            })["slots"]
        }

    before = open_times()
    _next_turn(ctx)
    listed = _execute_tool(db, ctx, "find_my_appointments", {})["appointments"]
    cancelled = _execute_tool(db, ctx, "cancel_appointment", {
        "appointment_id": listed[0]["appointment_id"], "reason": "",
    })
    assert "error" not in cancelled
    after = open_times()

    assert len(after) == len(before) + 1


def test_cancelling_in_the_same_turn_as_a_booking_is_refused(db, ctx):
    _register(db, ctx)
    _book(db, ctx, "د. سارة الخطيب", DAY.isoformat(), "كشفية جلدية عام")
    listed = _execute_tool(db, ctx, "find_my_appointments", {})["appointments"]
    result = _execute_tool(db, ctx, "cancel_appointment", {
        "appointment_id": listed[0]["appointment_id"], "reason": "",
    })
    assert "error" in result
    assert db.tables["appointments"].rows[0]["status"] != "cancelled_by_patient"


# --- scenario 4: branches don't leak into each other -------------------------


def test_switching_branches_changes_what_gets_searched(db, ctx):
    amman = _execute_tool(db, ctx, "find_available_slots", {
        "doctor_name": "", "specialty_query": "", "service_name": "", "doctor_gender": "",
        "doctor_language": "", "max_price": 0, "date_from": "", "date_to": "",
    })["slots"]
    assert {s["doctor_name"] for s in amman} == {"د. سارة الخطيب", "د. نور الحوراني"}

    _execute_tool(db, ctx, "select_branch", {"branch_name": "عيادة بلوتو - إربد"})
    irbid = _execute_tool(db, ctx, "find_available_slots", {
        "doctor_name": "", "specialty_query": "", "service_name": "", "doctor_gender": "",
        "doctor_language": "", "max_price": 0, "date_from": "", "date_to": "",
    })["slots"]
    assert {s["doctor_name"] for s in irbid} == {"د. لمى الرفاعي"}


def test_a_service_absent_from_this_branch_names_only_branches_that_have_it(db, ctx):
    result = _execute_tool(db, ctx, "find_available_slots", {
        "doctor_name": "", "specialty_query": "", "service_name": "كشفية أطفال",
        "doctor_gender": "", "doctor_language": "", "max_price": 0, "date_from": "", "date_to": "",
    })
    assert result["service_not_available_at_branch"] is True
    assert result["available_at_other_branches"] == ["عيادة بلوتو - إربد"]
    assert "العقبة" not in result["error"]


def test_services_are_listed_per_branch_not_clinic_wide(db, ctx):
    ctx["branch_id"] = IRBID
    names = {s["name"] for s in _execute_tool(db, ctx, "list_services", {"query": ""})["services"]}
    assert names == {"كشفية أطفال"}
