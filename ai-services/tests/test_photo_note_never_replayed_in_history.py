"""An older photo's analysis must never appear inside the conversation.

The note stored on an image message (so a follow-up question still has
context) was being replayed as a history turn, where it sat in the model's
context looking exactly like a fresh analysis -- and reliably beat the real
one in the system prompt.

Confirmed live, the decisive case: a photo of teeth was classified
correctly as "أسنان ولثة" and persisted as such, and the reply still
described "احمرار ونتوءات صغيرة على سطح اليد" -- the previous photo's note,
verbatim, for a completely different body part. Rewording the note as
"previous" and instructing the model to ignore older notes had both already
been tried and both failed. Keeping it out of the history is what works.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.routers.chat import (  # noqa: E402
    _PHOTO_CONTEXT_MARKER,
    _load_history,
    _previous_photo_note,
    _strip_photo_note,
)

_TEETH = f"{_PHOTO_CONTEXT_MARKER} تحليل مرئي آلي (analysis): النوع: أسنان ولثة]"
_HAND = f"{_PHOTO_CONTEXT_MARKER} تحليل مرئي آلي (analysis): النوع: طفح جلدي على سطح اليد]"


class _Query:
    def __init__(self, rows):
        self._rows = list(rows)
        self._order = None
        self._desc = False

    def select(self, *_a, **_k):
        return self

    def eq(self, column, value):
        self._rows = [r for r in self._rows if r.get(column) == value]
        return self

    def order(self, column, desc=False):
        self._order, self._desc = column, desc
        return self

    def limit(self, n):
        rows = self._rows
        if self._order:
            rows = sorted(rows, key=lambda r: r[self._order], reverse=self._desc)
        self._rows = rows[:n]
        return self

    def execute(self):
        return _Result(self._rows)


class _Result:
    def __init__(self, data):
        self.data = data


class _Db:
    def __init__(self, rows):
        self._rows = rows

    def table(self, _name):
        return _Query(self._rows)


def _img(content, at, cid="c1"):
    return {
        "conversation_id": cid,
        "direction": "inbound",
        "media_type": "image",
        "content": content,
        "created_at": at,
    }


# --- stripping ---------------------------------------------------------------


def test_a_stored_note_is_removed_from_a_history_turn():
    assert _strip_photo_note(_TEETH) == ""


def test_the_patients_own_caption_survives_stripping():
    assert _strip_photo_note(f"طفلي يعاني من هذا\n{_HAND}") == "طفلي يعاني من هذا"


def test_ordinary_text_is_untouched():
    assert _strip_photo_note("بدي احجز موعد") == "بدي احجز موعد"
    assert _strip_photo_note("") == ""
    assert _strip_photo_note(None) == ""


def test_history_shows_a_stripped_photo_turn_as_a_plain_image_placeholder():
    # Not as an empty turn: Gemini rejects a request whose last user turn is
    # empty, which is why the placeholder exists at all.
    db = _Db([_img(_HAND, "2026-01-01T10:00:00Z")])
    assert _load_history(db, "c1") == [{"role": "user", "content": "[صورة]"}]


def test_no_earlier_analysis_text_reaches_the_conversation_at_all():
    # The exact live failure: the hand note must not be visible on the turn
    # that answers the teeth photo.
    db = _Db(
        [
            _img(_HAND, "2026-01-01T10:00:00Z"),
            _img(_TEETH, "2026-01-01T10:05:00Z"),
        ]
    )
    rendered = " ".join(m["content"] for m in _load_history(db, "c1"))
    assert "اليد" not in rendered
    assert "أسنان" not in rendered


# --- deliberate retrieval for a follow-up question --------------------------


def test_the_latest_photos_note_is_available_for_a_follow_up_turn():
    db = _Db([_img(_HAND, "2026-01-01T10:00:00Z"), _img(_TEETH, "2026-01-01T10:05:00Z")])
    note = _previous_photo_note(db, "c1")
    assert note is not None
    assert "أسنان ولثة" in note
    assert "اليد" not in note


def test_a_caption_is_not_returned_as_the_note():
    db = _Db([_img(f"شوف هاي\n{_TEETH}", "2026-01-01T10:00:00Z")])
    note = _previous_photo_note(db, "c1")
    assert note.startswith(_PHOTO_CONTEXT_MARKER)
    assert "شوف هاي" not in note


def test_an_unanalysed_photo_yields_no_note():
    db = _Db([_img("طفلي يعاني من هذا", "2026-01-01T10:00:00Z")])
    assert _previous_photo_note(db, "c1") is None


def test_a_conversation_with_no_photos_yields_no_note():
    assert _previous_photo_note(_Db([]), "c1") is None
