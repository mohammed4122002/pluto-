"""_load_history: a photo/voice note with no caption has content="" on its
own row, which used to reach the model as a genuinely empty turn.

Confirmed live: an empty trailing user turn gets dropped when converted to
Gemini's message format (_for_gemini), so the request actually ended on
the previous assistant reply, and Gemini rejected the whole call with
"Requests ending with a model turn are not supported" -- exactly the
turns the Gemini fallback exists for (OpenAI down) failing on every
photo/voice message with no caption, silently, with the patient just
getting the generic handoff instead of an answer.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.routers.chat import _load_history  # noqa: E402


class _Query:
    def __init__(self, rows):
        self._rows = rows

    def select(self, *_a, **_k):
        return self

    def eq(self, column, value):
        self._rows = [r for r in self._rows if r.get(column) == value]
        return self

    def order(self, column, desc=False):
        self._rows = sorted(self._rows, key=lambda r: r[column], reverse=desc)
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
        return _Query(list(self._messages))


def _row(direction, content, media_type=None, created_at="2026-01-01T00:00:00Z"):
    return {"conversation_id": "c1", "direction": direction, "content": content, "media_type": media_type, "created_at": created_at}


def test_a_captionless_photo_gets_a_non_empty_placeholder():
    db = _Db([_row("inbound", "", media_type="image", created_at="2026-01-01T00:00:01Z")])
    history = _load_history(db, "c1")
    assert history[-1] == {"role": "user", "content": "[صورة]"}


def test_a_captionless_voice_note_gets_a_non_empty_placeholder():
    db = _Db([_row("inbound", "", media_type="audio", created_at="2026-01-01T00:00:01Z")])
    history = _load_history(db, "c1")
    assert history[-1] == {"role": "user", "content": "[رسالة صوتية]"}


def test_a_photo_with_a_real_caption_keeps_the_caption_not_the_placeholder():
    db = _Db([_row("inbound", "شو رأيك بهاي؟", media_type="image", created_at="2026-01-01T00:00:01Z")])
    history = _load_history(db, "c1")
    assert history[-1] == {"role": "user", "content": "شو رأيك بهاي؟"}


def test_an_ordinary_text_message_is_unaffected():
    db = _Db([_row("inbound", "بدي أحجز موعد", media_type=None, created_at="2026-01-01T00:00:01Z")])
    history = _load_history(db, "c1")
    assert history[-1] == {"role": "user", "content": "بدي أحجز موعد"}


def test_history_never_ends_on_a_genuinely_empty_turn_for_a_media_message():
    # The exact shape of the bug: the conversation's last turn is a
    # captionless photo, following an earlier assistant reply.
    db = _Db(
        [
            _row("outbound", "تمام، حد من فريقنا رح يتواصل معك", created_at="2026-01-01T00:00:01Z"),
            _row("inbound", "", media_type="image", created_at="2026-01-01T00:00:02Z"),
        ]
    )
    history = _load_history(db, "c1")
    assert history[-1]["role"] == "user"
    assert history[-1]["content"] != ""
