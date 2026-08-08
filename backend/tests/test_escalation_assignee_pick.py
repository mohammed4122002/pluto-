"""Who an escalated conversation gets handed to.

Least-loaded alone isn't enough: it will happily pick the idle pool member
whose Telegram chat was never linked, so the alert is silently dropped while
a busier-but-reachable colleague sits available. That happened live. Linked
staff come first; unlinked is a last resort that still beats nobody owning
the conversation at all.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.escalation import pick_escalation_assignee  # noqa: E402
from tests.fake_supabase import FakeSupabase  # noqa: E402

LINKED = "staff-linked"
UNLINKED = "staff-unlinked"
OTHER_LINKED = "staff-linked-2"


def _pool_row(staff_id: str, *, linked: bool, is_active: bool = True) -> dict:
    return {
        "staff_id": staff_id,
        "branch_id": None,
        "is_active": True,
        "staff": {"is_active": is_active, "telegram_chat_id": "chat-id" if linked else None},
    }


def _db(pool: list[dict], open_conversations: list[dict] | None = None) -> FakeSupabase:
    return FakeSupabase({"escalation_staff": pool, "conversations": open_conversations or []})


def test_prefers_linked_staff_even_when_unlinked_one_is_idle():
    # The unlinked member has zero load, the linked one is busy -- pure
    # least-loaded would pick the unreachable one. This is the live bug.
    db = _db(
        [_pool_row(LINKED, linked=True), _pool_row(UNLINKED, linked=False)],
        [{"assigned_staff_id": LINKED, "status": "open"}, {"assigned_staff_id": LINKED, "status": "open"}],
    )
    assert pick_escalation_assignee(db, None) == LINKED


def test_load_balances_among_linked_staff():
    db = _db(
        [_pool_row(LINKED, linked=True), _pool_row(OTHER_LINKED, linked=True)],
        [{"assigned_staff_id": LINKED, "status": "open"}],
    )
    assert pick_escalation_assignee(db, None) == OTHER_LINKED


def test_falls_back_to_unlinked_when_nobody_is_linked():
    # Losing the assignment entirely would be worse: an owned conversation
    # still surfaces in the dashboard for whoever it's assigned to.
    db = _db([_pool_row(UNLINKED, linked=False)])
    assert pick_escalation_assignee(db, None) == UNLINKED


def test_ignores_deactivated_staff_even_if_linked():
    db = _db([_pool_row(LINKED, linked=True, is_active=False), _pool_row(UNLINKED, linked=False)])
    assert pick_escalation_assignee(db, None) == UNLINKED


def test_returns_none_when_pool_is_empty():
    assert pick_escalation_assignee(_db([]), None) is None
