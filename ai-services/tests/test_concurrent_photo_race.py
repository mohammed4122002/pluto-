"""_latest_inbound_image_message / _latest_inbound_voice_message with
expected_media_url: pins one exact row instead of "whichever is newest
right now" -- the race two photos sent close together hit.

n8n gives every inbound Telegram message its own concurrent execution
(nothing serializes them), and a vision call takes several seconds. So the
/chat/reply request handling the *first* of two photos can end up querying
"latest inbound image in this conversation" only after the *second* photo
has already been inserted by the other, still-running request -- and
answers the wrong one.

Confirmed live twice in the same session: a teeth photo, classified
correctly, was answered with a hand-rash analysis from an earlier photo;
and separately a photo in a burst got a generic "you sent several photos"
reply with no analysis at all. Neither was a classification error -- the
vision model got every photo right. The lookup just resolved to the wrong
row.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.routers.chat import (  # noqa: E402
    _latest_inbound_image_message,
    _latest_inbound_voice_message,
)


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


def _img(msg_id, url, at, content="", cid="c1"):
    return {
        "id": msg_id,
        "conversation_id": cid,
        "direction": "inbound",
        "media_type": "image",
        "media_url": url,
        "content": content,
        "created_at": at,
    }


def _voice(msg_id, url, at, content="", cid="c1"):
    return {
        "id": msg_id,
        "conversation_id": cid,
        "direction": "inbound",
        "media_type": "audio",
        "media_url": url,
        "content": content,
        "created_at": at,
    }


_TEETH = _img("teeth", "https://x/teeth.jpg", "2026-01-01T10:00:05Z")
_HAND = _img("hand", "https://x/hand.jpg", "2026-01-01T10:00:00Z")


def test_the_exact_live_race_teeth_call_resolves_to_teeth_not_hand():
    # Both photos already stored (as they would be by the time either
    # /chat/reply call gets around to querying), and the request that is
    # meant to be answering the teeth photo asks for it by its own url.
    db = _Db([_HAND, _TEETH])
    result = _latest_inbound_image_message(db, "c1", expected_media_url="https://x/teeth.jpg")
    assert result["id"] == "teeth"


def test_the_hand_call_still_resolves_to_hand_even_though_teeth_is_newer():
    # This is the case that broke without the fix: "latest" would have
    # picked teeth for both calls.
    db = _Db([_HAND, _TEETH])
    result = _latest_inbound_image_message(db, "c1", expected_media_url="https://x/hand.jpg")
    assert result["id"] == "hand"


def test_no_expected_url_falls_back_to_the_latest_image():
    # reclaim_stale_conversations has no live payload to pin a url from, and
    # runs one conversation at a time on a schedule rather than
    # concurrently -- the old "latest" behaviour is correct there.
    db = _Db([_HAND, _TEETH])
    result = _latest_inbound_image_message(db, "c1")
    assert result["id"] == "teeth"


def test_an_expected_url_matching_nothing_returns_none_rather_than_a_wrong_photo():
    # Never fall back to "latest" as a silent substitute -- that reintroduces
    # exactly the failure this exists to prevent.
    db = _Db([_HAND, _TEETH])
    assert _latest_inbound_image_message(db, "c1", expected_media_url="https://x/missing.jpg") is None


def test_the_url_match_is_still_scoped_to_this_conversation():
    other = _img("intruder", "https://x/teeth.jpg", "2026-01-01T10:00:07Z", cid="other-convo")
    db = _Db([_TEETH, other])
    result = _latest_inbound_image_message(db, "c1", expected_media_url="https://x/teeth.jpg")
    assert result["id"] == "teeth"


def test_voice_notes_get_the_same_exact_match_guard():
    a = _voice("v1", "https://x/a.ogg", "2026-01-01T10:00:00Z")
    b = _voice("v2", "https://x/b.ogg", "2026-01-01T10:00:05Z")
    db = _Db([a, b])
    assert _latest_inbound_voice_message(db, "c1", expected_media_url="https://x/a.ogg")["id"] == "v1"
    assert _latest_inbound_voice_message(db, "c1", expected_media_url="https://x/b.ogg")["id"] == "v2"
