"""slots.slot_capacity and clinic_settings.allow_overbooking/max_overbooking
let more than one live appointment sit on the same slot -- so releasing ONE
of them must recount what's still booked instead of always reopening the
whole slot. Getting this wrong would let a slot with two other patients
still on it show up as free again, or fire a waitlist offer for a seat that
was never actually empty.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.scheduling import _status_after_release  # noqa: E402
from tests.fake_supabase import FakeSupabase  # noqa: E402

SLOT = "slot-1"


def _db(*, slot_capacity: int, allow_overbooking: bool, max_overbooking: int, appointment_statuses: list[str]) -> FakeSupabase:
    return FakeSupabase(
        {
            "slots": [{"id": SLOT, "slot_capacity": slot_capacity}],
            "clinic_settings": [{"allow_overbooking": allow_overbooking, "max_overbooking": max_overbooking}],
            "appointments": [{"id": f"a{i}", "slot_id": SLOT, "status": s} for i, s in enumerate(appointment_statuses)],
        }
    )


def test_ordinary_capacity_one_slot_reopens_once_its_only_booking_is_gone():
    db = _db(slot_capacity=1, allow_overbooking=False, max_overbooking=0, appointment_statuses=["cancelled_by_patient"])
    assert _status_after_release(db, SLOT) == "available"


def test_capacity_one_slot_stays_booked_if_somehow_still_occupied():
    # Defensive: shouldn't happen for a real capacity-1 slot, but the count
    # must still drive the answer rather than assuming release always empties it.
    db = _db(slot_capacity=1, allow_overbooking=False, max_overbooking=0, appointment_statuses=["confirmed"])
    assert _status_after_release(db, SLOT) == "booked"


def test_multi_capacity_slot_stays_available_while_under_capacity():
    # capacity 3, one just released, two others still active -> still room.
    db = _db(
        slot_capacity=3, allow_overbooking=False, max_overbooking=0,
        appointment_statuses=["cancelled_by_patient", "confirmed", "requested"],
    )
    assert _status_after_release(db, SLOT) == "available"


def test_overbooked_slot_drops_back_to_overbooked_not_available():
    # capacity 2, overbooking +1 (effective 3). Three were active, one
    # released -> two remain, which is still >= the normal capacity of 2.
    db = _db(
        slot_capacity=2, allow_overbooking=True, max_overbooking=1,
        appointment_statuses=["cancelled_by_patient", "confirmed", "requested"],
    )
    assert _status_after_release(db, SLOT) == "overbooked"


def test_terminal_statuses_other_than_the_freed_one_dont_count_as_occupying():
    db = _db(
        slot_capacity=2, allow_overbooking=False, max_overbooking=0,
        appointment_statuses=["cancelled_by_patient", "no_show"],
    )
    assert _status_after_release(db, SLOT) == "available"
