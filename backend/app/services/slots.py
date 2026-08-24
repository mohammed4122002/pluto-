from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from supabase import Client

_DOW_LOOKUP = tuple(range(7))  # 0=Sunday..6=Saturday, matches doctor_availability.day_of_week


def block_future_available_slots(db: Client, staff_id: str) -> int:
    """Deactivating (or soft-deleting) a doctor must stop patients from
    booking them going forward — book_slot() only checks a slot's own
    status, never staff.is_active, so a deactivated doctor's still-'available'
    future slots stayed fully bookable through the dashboard search and the
    AI chat (confirmed live: 176 slots for a QA doctor stayed 'available'
    after is_active was set to false). Only touches slots still 'available';
    a slot already booked/held keeps its real appointment untouched — this
    doesn't cancel anyone's existing visit, it just closes the booking gap."""
    rows = (
        db.table("slots")
        .update({"status": "blocked", "block_reason": "doctor_deactivated"})
        .eq("doctor_id", staff_id)
        .eq("status", "available")
        .gte("start_at", datetime.now(timezone.utc).isoformat())
        .execute()
        .data
    )
    return len(rows)


def _iso_day_of_week(d: date) -> int:
    return (d.weekday() + 1) % 7


# Why a generate run produced nothing. Returning a bare 0 made every cause
# look identical from the dashboard, which is how "generate does nothing"
# became the reported symptom instead of "this doctor has no schedule".
NO_AVAILABILITY = "no_availability"
INACTIVE_DOCTOR = "inactive_doctor"
NO_WORKING_DAYS = "no_working_days"


def generate_slots_for_doctor(
    db: Client, staff_id: str, branch_id: str, from_date: date, to_date: date
) -> tuple[int, str | None]:
    """(Re)generates 'available' slots for a doctor at a branch across a date
    range from doctor_availability, honoring doctor_leaves and branch_holidays.
    Never touches slots that are already held/booked/blocked — only clears and
    replaces slots still in 'available' status, so it's safe to call again
    after a schedule edit."""
    staff_rows = db.table("staff").select("is_active").eq("id", staff_id).limit(1).execute().data
    if not staff_rows or not staff_rows[0]["is_active"]:
        # A deactivated doctor's future slots get explicitly blocked
        # (block_future_available_slots) so patients can't book them — but
        # nothing stopped a later "generate slots" call (e.g. extending
        # everyone's calendar another 30 days, a routine admin action) from
        # silently creating brand-new 'available' slots for that same
        # doctor, undoing the block (confirmed live: generating slots for an
        # already-deactivated QA doctor created 88 fresh bookable slots).
        # Regenerating a leaving/left doctor's schedule should be a no-op.
        return 0, INACTIVE_DOCTOR

    availability = (
        db.table("doctor_availability")
        .select("*")
        .eq("staff_id", staff_id)
        .eq("branch_id", branch_id)
        .eq("is_active", True)
        .execute()
        .data
    )
    if not availability:
        return 0, NO_AVAILABILITY

    branch = db.table("branches").select("timezone").eq("id", branch_id).limit(1).execute().data
    tz = ZoneInfo(branch[0]["timezone"] if branch else "Asia/Amman")

    leaves = db.table("doctor_leaves").select("start_at, end_at").eq("staff_id", staff_id).execute().data
    holidays = (
        db.table("branch_holidays")
        .select("holiday_date, is_full_day, start_time, end_time")
        .eq("branch_id", branch_id)
        .execute()
        .data
    )
    holiday_by_date = {h["holiday_date"]: h for h in holidays}

    limits_rows = db.table("doctor_limits").select("*").eq("staff_id", staff_id).limit(1).execute().data
    limits = limits_rows[0] if limits_rows else {}
    buffer_before = limits.get("buffer_before_minutes") or 0
    buffer_after = limits.get("buffer_after_minutes") or 0
    break_start = limits.get("break_start_time")
    break_end = limits.get("break_end_time")

    availability_by_day: dict[int, list[dict]] = {}
    for row in availability:
        availability_by_day.setdefault(row["day_of_week"], []).append(row)

    now = datetime.now(tz)
    new_slots: list[dict] = []
    current = from_date
    while current <= to_date:
        dow = _iso_day_of_week(current)
        rows = availability_by_day.get(dow, [])
        holiday = holiday_by_date.get(current.isoformat())

        for row in rows:
            slot_minutes = row["slot_duration_minutes"]
            # buffer_before is prep time the doctor needs ahead of every
            # patient, not just the first one of the day -- so it shifts the
            # day's own start (nothing is bookable before the doctor has had
            # their setup time) and, like buffer_after, widens the gap between
            # consecutive slots.
            step = timedelta(minutes=slot_minutes + buffer_before + buffer_after)
            work_start = datetime.combine(current, _parse_time(row["start_time"]), tzinfo=tz) + timedelta(
                minutes=buffer_before
            )
            work_end = datetime.combine(current, _parse_time(row["end_time"]), tzinfo=tz)

            cursor = work_start
            while cursor + timedelta(minutes=slot_minutes) <= work_end:
                slot_end = cursor + timedelta(minutes=slot_minutes)

                if cursor < now:
                    cursor += step
                    continue
                if holiday and holiday["is_full_day"]:
                    cursor += step
                    continue
                if holiday and not holiday["is_full_day"]:
                    h_start = datetime.combine(current, _parse_time(holiday["start_time"]), tzinfo=tz)
                    h_end = datetime.combine(current, _parse_time(holiday["end_time"]), tzinfo=tz)
                    if cursor < h_end and slot_end > h_start:
                        cursor += step
                        continue
                if break_start and break_end:
                    b_start = datetime.combine(current, _parse_time(break_start), tzinfo=tz)
                    b_end = datetime.combine(current, _parse_time(break_end), tzinfo=tz)
                    if cursor < b_end and slot_end > b_start:
                        cursor += step
                        continue
                if _overlaps_any_leave(cursor, slot_end, leaves):
                    cursor += step
                    continue

                new_slots.append(
                    {
                        "branch_id": branch_id,
                        "doctor_id": staff_id,
                        "start_at": cursor.isoformat(),
                        "end_at": slot_end.isoformat(),
                        "duration_minutes": slot_minutes,
                        "status": "available",
                    }
                )
                cursor += step

        current += timedelta(days=1)

    range_start = datetime.combine(from_date, datetime.min.time(), tzinfo=tz).isoformat()
    range_end = datetime.combine(to_date + timedelta(days=1), datetime.min.time(), tzinfo=tz).isoformat()
    (
        db.table("slots")
        .delete()
        .eq("doctor_id", staff_id)
        .eq("branch_id", branch_id)
        .eq("status", "available")
        .gte("start_at", range_start)
        .lt("start_at", range_end)
        .execute()
    )

    if new_slots:
        for i in range(0, len(new_slots), 500):
            db.table("slots").insert(new_slots[i : i + 500]).execute()

    return len(new_slots), (None if new_slots else NO_WORKING_DAYS)


def _parse_time(value):
    if isinstance(value, str):
        from datetime import time as time_cls

        parts = value.split(":")
        return time_cls(int(parts[0]), int(parts[1]), int(parts[2]) if len(parts) > 2 else 0)
    return value


def _overlaps_any_leave(start, end, leaves: list[dict]) -> bool:
    for leave in leaves:
        leave_start = datetime.fromisoformat(leave["start_at"])
        leave_end = datetime.fromisoformat(leave["end_at"])
        if start < leave_end and end > leave_start:
            return True
    return False


def block_slots_for_leave(db: Client, staff_id: str, leave_id: str, start_at: str, end_at: str) -> int:
    """Close the booking window for a leave the doctor just registered.

    Tagged with the leave's own id rather than a generic reason, so cancelling
    the leave can reopen exactly the slots it closed and nothing else — a slot
    blocked earlier for maintenance or by an admin stays blocked.

    Only touches slots still 'available': one already booked or held belongs to
    a real patient, and cancelling those is reception's call (and needs
    appointment.cancel), not a side effect of filing leave.
    """
    rows = (
        db.table("slots")
        .update({"status": "blocked", "block_reason": f"leave:{leave_id}"})
        .eq("doctor_id", staff_id)
        .eq("status", "available")
        .gte("start_at", start_at)
        .lt("start_at", end_at)
        .execute()
        .data
    )
    return len(rows)


def unblock_slots_for_leave(db: Client, leave_id: str) -> int:
    """Reopen precisely the slots `block_slots_for_leave` closed."""
    rows = (
        db.table("slots")
        .update({"status": "available", "block_reason": None})
        .eq("block_reason", f"leave:{leave_id}")
        .eq("status", "blocked")
        .execute()
        .data
    )
    return len(rows)


def _holiday_window(db: Client, branch_id: str, holiday: dict) -> tuple[str, str]:
    """The [start, end) instants a holiday actually covers, in real UTC terms.

    A holiday is stored as a local calendar date (plus optional local times),
    but slots are timestamptz -- so "the 3rd of the month" has to be resolved
    against the branch's own timezone or it lands three hours off in Amman.
    """
    branch = db.table("branches").select("timezone").eq("id", branch_id).limit(1).execute().data
    tz = ZoneInfo((branch[0].get("timezone") if branch else None) or "Asia/Amman")
    day = date.fromisoformat(str(holiday["holiday_date"]))

    if holiday.get("is_full_day", True) or not (holiday.get("start_time") and holiday.get("end_time")):
        start = datetime.combine(day, datetime.min.time(), tzinfo=tz)
        return start.isoformat(), (start + timedelta(days=1)).isoformat()

    start = datetime.combine(day, _parse_time(holiday["start_time"]), tzinfo=tz)
    end = datetime.combine(day, _parse_time(holiday["end_time"]), tzinfo=tz)
    return start.isoformat(), end.isoformat()


def block_slots_for_holiday(db: Client, holiday_id: str, branch_id: str, holiday: dict) -> int:
    """Close the booking window for a holiday the clinic just declared.

    Without this, adding a holiday would do nothing at all to the slots that
    already exist for that day -- generate_slots_for_doctor honors holidays,
    but only for slots it creates *afterwards*, so a holiday declared for next
    month would leave every already-generated slot on that day openly
    bookable. That is the worst kind of half-working feature: the holiday is
    visibly saved, and patients keep booking straight through it.

    Tagged with the holiday's own id (not a generic reason) so removing the
    holiday reopens exactly the slots it closed and nothing else -- a slot
    blocked earlier for a doctor's leave or by an admin stays blocked.

    Only touches slots still 'available': one already booked belongs to a real
    patient, and cancelling those is reception's call (they may need to phone
    the patient), not a side effect of adding a date to a calendar.
    """
    window_start, window_end = _holiday_window(db, branch_id, holiday)
    rows = (
        db.table("slots")
        .update({"status": "blocked", "block_reason": f"holiday:{holiday_id}"})
        .eq("branch_id", branch_id)
        .eq("status", "available")
        .lt("start_at", window_end)
        .gt("end_at", window_start)
        .execute()
        .data
    )
    return len(rows)


def unblock_slots_for_holiday(db: Client, holiday_id: str) -> int:
    """Reopen precisely the slots `block_slots_for_holiday` closed."""
    rows = (
        db.table("slots")
        .update({"status": "available", "block_reason": None})
        .eq("block_reason", f"holiday:{holiday_id}")
        .eq("status", "blocked")
        .execute()
        .data
    )
    return len(rows)
