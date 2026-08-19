"""Guards on the two mechanical escalation triggers -- the turn cap and the
keyword list -- neither of which involves the model deciding anything.

Live evidence this pins: patients were handed to staff for writing "اهلا",
"8", and "4". Every one of those went through max_ai_turns_before_human,
because ai_episode_started_at only ever restarted when a hand-off was
reclaimed (or staff flipped the conversation back by hand) and never when
the AI actually did its job. Once a conversation used up its turn budget,
every later message tripped the cap forever, and the only route back to a
working bot was to be escalated and then left unanswered for the full
20-minute timeout.
"""

import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.routers.chat import (  # noqa: E402
    _episode_start_for_turn,
    _escalation_keyword_hit,
    _previous_message_at,
)


class _Query:
    def __init__(self, table):
        self._table = table
        self._rows = list(table.rows)
        self._update = None
        self._eqs = {}
        self._order = None
        self._desc = False

    def select(self, *_a, **_k):
        return self

    def eq(self, column, value):
        self._eqs[column] = value
        if self._update is None:
            self._rows = [r for r in self._rows if r.get(column) == value]
        return self

    def order(self, column, desc=False):
        self._order, self._desc = column, desc
        return self

    def limit(self, n):
        self._rows = self._sorted()[:n]
        return self

    def update(self, values):
        self._update = values
        return self

    def _sorted(self):
        if not self._order:
            return self._rows
        return sorted(self._rows, key=lambda r: r[self._order], reverse=self._desc)

    def execute(self):
        if self._update is not None:
            self._table.updates.append(dict(self._update))
            return _Result([])
        return _Result(self._sorted())


class _Result:
    def __init__(self, data):
        self.data = data


class _Table:
    def __init__(self, rows=None):
        self.rows = rows or []
        self.updates = []


class _Db:
    def __init__(self, messages):
        self.tables = {"messages": _Table(messages), "conversations": _Table()}

    def table(self, name):
        return _Query(self.tables.setdefault(name, _Table()))


def _at(minutes_ago):
    return (datetime.now(timezone.utc) - timedelta(minutes=minutes_ago)).isoformat()


def _msg(minutes_ago):
    return {"conversation_id": "c1", "created_at": _at(minutes_ago)}


_OLD_EPISODE = "2026-01-01T00:00:00+00:00"


# --- the turn cap must not outlive the round it was measuring ---------------


def test_a_patient_returning_after_a_long_gap_gets_a_fresh_turn_budget():
    # The "اهلا" case: the current message plus one from hours earlier.
    db = _Db([_msg(0), _msg(600)])
    started = _episode_start_for_turn(db, "c1", _OLD_EPISODE)
    assert started != _OLD_EPISODE
    assert db.tables["conversations"].updates == [{"ai_episode_started_at": started}]


def test_a_reply_inside_an_active_conversation_keeps_the_same_budget():
    # Mid-conversation the cap has to keep working -- this must not become a
    # way to never escalate at all.
    db = _Db([_msg(0), _msg(2)])
    assert _episode_start_for_turn(db, "c1", _OLD_EPISODE) == _OLD_EPISODE
    assert db.tables["conversations"].updates == []


def test_the_very_first_message_of_a_conversation_leaves_the_budget_alone():
    # Nothing before it to measure a gap against.
    db = _Db([_msg(0)])
    assert _episode_start_for_turn(db, "c1", _OLD_EPISODE) == _OLD_EPISODE
    assert db.tables["conversations"].updates == []


def test_the_gap_is_measured_against_the_previous_message_not_the_current_one():
    # n8n records the inbound message before calling /chat/reply, so the
    # newest row is always the one being answered right now; measuring
    # against it would make every gap zero and the reset dead code.
    db = _Db([_msg(0), _msg(600)])
    previous = _previous_message_at(db, "c1")
    assert previous is not None
    assert (datetime.now(timezone.utc) - previous) > timedelta(minutes=500)


def test_another_conversations_messages_never_affect_this_ones_gap():
    db = _Db([_msg(0), {"conversation_id": "other", "created_at": _at(600)}])
    assert _previous_message_at(db, "c1") is None


# --- keyword matching must not fire on fragments of unrelated words ---------


def test_a_configured_keyword_still_escalates():
    assert _escalation_keyword_hit("بدي اقدم شكوى على الخدمة", ["شكوى"]) is True


def test_an_arabic_prefix_does_not_stop_a_real_match():
    # Arabic glues the article and conjunctions onto the front of a word, so
    # requiring a leading boundary would silently break the whole feature.
    assert _escalation_keyword_hit("الشكوى تبعتي ما انحلت", ["شكوى"]) is True
    assert _escalation_keyword_hit("وشكوى تانية كمان", ["شكوى"]) is True


def test_a_keyword_buried_inside_a_longer_word_does_not_escalate():
    # "مدير" inside "مديرية" is not a request for a manager.
    assert _escalation_keyword_hit("ساكن بمديرية التربية", ["مدير"]) is False


def test_a_latin_keyword_inside_a_longer_word_does_not_escalate():
    assert _escalation_keyword_hit("can you book me now please", ["no"]) is False
    assert _escalation_keyword_hit("no thanks", ["no"]) is False  # too short, ignored


def test_absurdly_short_keywords_are_ignored_as_misconfiguration():
    # At one or two characters a coincidental hit is near-certain, and every
    # hit pulls a patient out of a working conversation.
    assert _escalation_keyword_hit("مرحبا بدي احجز موعد", ["ا"]) is False
    assert _escalation_keyword_hit("مرحبا بدي احجز موعد", ["حج"]) is False


def test_no_keywords_configured_never_escalates():
    assert _escalation_keyword_hit("أي رسالة عادية", []) is False
    assert _escalation_keyword_hit("أي رسالة عادية", ["", "   "]) is False


def test_an_empty_message_never_escalates_on_keywords():
    # A captionless photo or voice note arrives here as an empty string.
    assert _escalation_keyword_hit("", ["شكوى"]) is False
