"""_has_inbound_since: the guard that stops the reclaim sweep from
re-answering a conversation nobody has written to.

Live incident this pins: a patient sent one photo of a burned hand, the AI
replied with emergency advice and escalated to staff. Staff never answered,
so the every-5-minutes reclaim sweep handed it back to the AI once the
20-minute handoff timeout elapsed -- which re-read the same unchanged
history, produced the same reply, and escalated again on the same grounds.
That reset escalated_at, so the next sweep found it stale again. The
patient received the identical "go to the emergency room" message roughly
every 25 minutes for six hours without ever sending anything.

The fix is to reclaim only when the patient actually said something after
the handoff started -- a real backlog -- which is the only case the sweep
exists to serve.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.routers.chat import _has_inbound_since  # noqa: E402


class _Query:
    def __init__(self, rows):
        self._rows = list(rows)

    def select(self, *_a, **_k):
        return self

    def eq(self, column, value):
        self._rows = [r for r in self._rows if r.get(column) == value]
        return self

    def gt(self, column, value):
        self._rows = [r for r in self._rows if r.get(column, "") > value]
        return self

    def limit(self, n):
        self._rows = self._rows[:n]
        return self

    def execute(self):
        return _Result(self._rows)


class _Result:
    def __init__(self, data):
        self.data = data


class _Db:
    def __init__(self, messages):
        self._messages = messages

    def table(self, _name):
        return _Query(self._messages)


def _msg(direction, created_at, conversation_id="c1"):
    return {
        "id": f"{direction}-{created_at}",
        "conversation_id": conversation_id,
        "direction": direction,
        "created_at": created_at,
    }


_ESCALATED_AT = "2026-01-01T12:00:00Z"


def test_a_patient_message_after_the_handoff_is_a_real_backlog():
    db = _Db([_msg("inbound", "2026-01-01T12:30:00Z")])
    assert _has_inbound_since(db, "c1", _ESCALATED_AT) is True


def test_silence_since_the_handoff_is_not_a_backlog():
    # The exact loop condition: the only inbound message predates the
    # escalation, so the AI has nothing new to answer.
    db = _Db([_msg("inbound", "2026-01-01T11:59:00Z")])
    assert _has_inbound_since(db, "c1", _ESCALATED_AT) is False


def test_the_bots_own_replies_after_the_handoff_do_not_count_as_a_backlog():
    # This is what made the loop self-sustaining: each reclaim wrote a new
    # outbound message, so any "has anything happened since?" check based on
    # messages in general (rather than inbound ones) would stay true forever
    # and keep re-triggering itself.
    db = _Db(
        [
            _msg("inbound", "2026-01-01T11:59:00Z"),
            _msg("outbound", "2026-01-01T12:25:00Z"),
            _msg("outbound", "2026-01-01T12:50:00Z"),
        ]
    )
    assert _has_inbound_since(db, "c1", _ESCALATED_AT) is False


def test_a_conversation_with_no_messages_at_all_is_not_a_backlog():
    assert _has_inbound_since(_Db([]), "c1", _ESCALATED_AT) is False


def test_only_this_conversations_messages_count():
    # A different patient writing in must never make this conversation look
    # like it has a backlog waiting.
    db = _Db([_msg("inbound", "2026-01-01T12:30:00Z", conversation_id="other")])
    assert _has_inbound_since(db, "c1", _ESCALATED_AT) is False
