"""Escalations go to someone who can actually resolve them.

Every escalation used to go to whoever in the pool was least busy, so "is
this dangerous?" could land on a receptionist who cannot answer it, and a
refund dispute could pull a doctor out of clinic. Routing splits the pool by
what the escalation is about.

The split is inferred from role by default -- doctor answers clinical
questions, everyone else works the front desk -- so this needs no setup at
all. `handles` only exists for where that inference is wrong.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.escalation import (  # noqa: E402
    ADMINISTRATIVE,
    MEDICAL,
    pick_escalation_assignee,
)
from tests.fake_supabase import FakeSupabase  # noqa: E402

DOCTOR = "staff-doctor"
RECEPTION = "staff-reception"
ADMIN = "staff-admin"


def _member(staff_id: str, role: str, *, handles: str | None = None, linked: bool = True) -> dict:
    return {
        "staff_id": staff_id,
        "branch_id": None,
        "is_active": True,
        "handles": handles,
        "staff": {"is_active": True, "role": role, "telegram_chat_id": "chat" if linked else None},
    }


def _db(pool: list[dict], open_conversations: list[dict] | None = None) -> FakeSupabase:
    return FakeSupabase({"escalation_staff": pool, "conversations": open_conversations or []})


def test_medical_goes_to_the_doctor():
    db = _db([_member(DOCTOR, "doctor"), _member(RECEPTION, "receptionist")])
    assert pick_escalation_assignee(db, None, MEDICAL) == DOCTOR


def test_administrative_goes_to_reception():
    db = _db([_member(DOCTOR, "doctor"), _member(RECEPTION, "receptionist")])
    assert pick_escalation_assignee(db, None, ADMINISTRATIVE) == RECEPTION


def test_routing_beats_load_balancing():
    # The doctor is busier, but a clinical question the receptionist cannot
    # answer must still reach the doctor.
    db = _db(
        [_member(DOCTOR, "doctor"), _member(RECEPTION, "receptionist")],
        [{"assigned_staff_id": DOCTOR, "status": "open"}, {"assigned_staff_id": DOCTOR, "status": "open"}],
    )
    assert pick_escalation_assignee(db, None, MEDICAL) == DOCTOR


def test_load_is_still_balanced_within_the_matching_group():
    busy, free = "doc-busy", "doc-free"
    db = _db(
        [_member(busy, "doctor"), _member(free, "doctor")],
        [{"assigned_staff_id": busy, "status": "open"}],
    )
    assert pick_escalation_assignee(db, None, MEDICAL) == free


def test_an_explicit_handles_overrides_the_role():
    # Both roles deliberately inverted, so each category has exactly one
    # correct answer and the assertion cannot be satisfied by the
    # nobody-matched fallback picking arbitrarily.
    pool = [
        _member(DOCTOR, "doctor", handles=ADMINISTRATIVE),
        _member(RECEPTION, "receptionist", handles=MEDICAL),
    ]
    assert pick_escalation_assignee(_db(pool), None, MEDICAL) == RECEPTION
    assert pick_escalation_assignee(_db(pool), None, ADMINISTRATIVE) == DOCTOR


def test_admins_count_as_front_desk_not_clinical():
    db = _db([_member(ADMIN, "admin")])
    assert pick_escalation_assignee(db, None, ADMINISTRATIVE) == ADMIN


def test_never_drops_an_escalation_when_no_one_matches():
    # No doctor on escalation duty, but a clinical question still has to
    # reach a human -- silence is the one unacceptable outcome.
    db = _db([_member(RECEPTION, "receptionist")])
    assert pick_escalation_assignee(db, None, MEDICAL) == RECEPTION


def test_no_category_keeps_the_old_whole_pool_behaviour():
    db = _db([_member(DOCTOR, "doctor")], [{"assigned_staff_id": DOCTOR, "status": "open"}])
    assert pick_escalation_assignee(db, None) == DOCTOR


def test_still_prefers_a_linked_colleague_within_the_matched_group():
    unlinked, linked = "doc-unlinked", "doc-linked"
    db = _db(
        [_member(unlinked, "doctor", linked=False), _member(linked, "doctor")],
        [{"assigned_staff_id": linked, "status": "open"}],
    )
    assert pick_escalation_assignee(db, None, MEDICAL) == linked
