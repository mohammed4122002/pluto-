"""_latest_inbound_voice_message / _transcribe_voice_note_for_turn: the
plumbing that makes a voice note behave exactly like a typed message
everywhere downstream (history, escalation keywords, patient_said) once
transcribed -- and never re-transcribes (re-billing Whisper) once it has.
"""

import sys
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.routers.chat import _latest_inbound_voice_message, _transcribe_voice_note_for_turn  # noqa: E402


class _Query:
    def __init__(self, table):
        self._table = table
        self._rows = list(table.rows)
        self._update = None
        self._order_col = None
        self._order_desc = False

    def select(self, *_a, **_k):
        return self

    def eq(self, column, value):
        self._rows = [r for r in self._rows if r.get(column) == value]
        return self

    def order(self, column, desc=False):
        self._order_col = column
        self._order_desc = desc
        return self

    def limit(self, n):
        rows = self._rows
        if self._order_col:
            rows = sorted(rows, key=lambda r: r[self._order_col], reverse=self._order_desc)
        self._rows = rows[:n]
        return self

    def update(self, values):
        self._update = values
        return self

    def execute(self):
        if self._update is not None:
            ids = {r["id"] for r in self._rows}
            for row in self._table.rows:
                if row["id"] in ids:
                    row.update(self._update)
            return _Result([])
        rows = self._rows
        if self._order_col:
            rows = sorted(rows, key=lambda r: r[self._order_col], reverse=self._order_desc)
        return _Result(rows)


class _Result:
    def __init__(self, data):
        self.data = data


class _Table:
    def __init__(self, rows=None):
        self.rows = rows or []


class _Db:
    def __init__(self, messages=None):
        self.tables = {"messages": _Table(messages or [])}

    def table(self, name):
        return _Query(self.tables[name])


def _voice_message(msg_id="m1", content="", created_at="2026-01-01T00:00:00Z"):
    return {
        "id": msg_id,
        "conversation_id": "c1",
        "direction": "inbound",
        "content": content,
        "media_url": "https://example.test/voice.ogg",
        "media_type": "voice",
        "created_at": created_at,
    }


# --- _latest_inbound_voice_message -------------------------------------------


def test_finds_an_untranscribed_voice_note():
    db = _Db(messages=[_voice_message()])
    row = _latest_inbound_voice_message(db, "c1")
    assert row is not None
    assert row["id"] == "m1"


def test_a_voice_note_already_transcribed_is_not_returned_again():
    db = _Db(messages=[_voice_message(content="بدي أحجز موعد")])
    assert _latest_inbound_voice_message(db, "c1") is None


def test_a_plain_text_message_is_not_a_voice_note():
    db = _Db(messages=[{**_voice_message(), "media_type": None, "media_url": None}])
    assert _latest_inbound_voice_message(db, "c1") is None


def test_no_messages_at_all_returns_none():
    db = _Db(messages=[])
    assert _latest_inbound_voice_message(db, "c1") is None


def test_only_the_most_recent_message_is_considered():
    db = _Db(
        messages=[
            _voice_message(msg_id="old", content="", created_at="2026-01-01T00:00:00Z"),
            {
                "id": "new",
                "conversation_id": "c1",
                "direction": "inbound",
                "content": "بدي أحجز",
                "media_url": None,
                "media_type": None,
                "created_at": "2026-01-02T00:00:00Z",
            },
        ]
    )
    assert _latest_inbound_voice_message(db, "c1") is None


# --- _transcribe_voice_note_for_turn ------------------------------------------


class _FakeClient:
    pass


@patch("app.routers.chat.transcribe_voice_message", return_value="بدي أحجز موعد بكرة")
def test_a_successful_transcription_is_written_back_to_the_message_row(_mock):
    db = _Db(messages=[_voice_message()])
    text, had_voice_note = _transcribe_voice_note_for_turn(db, "c1", _FakeClient())
    assert text == "بدي أحجز موعد بكرة"
    assert had_voice_note is True
    assert db.tables["messages"].rows[0]["content"] == "بدي أحجز موعد بكرة"


@patch("app.routers.chat.transcribe_voice_message", return_value=None)
def test_a_failed_transcription_leaves_the_row_untouched(_mock):
    db = _Db(messages=[_voice_message()])
    text, had_voice_note = _transcribe_voice_note_for_turn(db, "c1", _FakeClient())
    assert text is None
    assert had_voice_note is True
    assert db.tables["messages"].rows[0]["content"] == ""


@patch("app.routers.chat.transcribe_voice_message")
def test_no_voice_note_never_calls_the_transcription_api_at_all(mock_transcribe):
    db = _Db(messages=[])
    text, had_voice_note = _transcribe_voice_note_for_turn(db, "c1", _FakeClient())
    assert text is None
    assert had_voice_note is False
    mock_transcribe.assert_not_called()
