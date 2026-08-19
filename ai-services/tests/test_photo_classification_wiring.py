"""_photo_description_for_turn: a failed vision call must never be treated
the same as Gemini explicitly classifying a photo as "none" (not
medical/cosmetic) -- confirmed live, a photo of an injured/burned hand got
no classification back at all (almost certainly a safety filter on a
graphic wound image), and the turn treated that failure identically to a
genuine "none" classification, which routed it into the receipt-matching
path and told the patient their payment receipt was received.
"""

import sys
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.routers.chat import _photo_description_for_turn  # noqa: E402


class _Query:
    def __init__(self, table):
        self._table = table
        self._rows = list(table.rows)
        self._insert = None
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

    def insert(self, values):
        self._insert = values
        return self

    def execute(self):
        if self._insert is not None:
            row = dict(self._insert)
            self._table.rows.append(row)
            return _Result([row])
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
        self.tables = {"messages": _Table(messages or []), "audit_log": _Table()}

    def table(self, name):
        return _Query(self.tables.setdefault(name, _Table()))


def _image_message(msg_id="m1", created_at="2026-01-01T00:00:00Z"):
    return {
        "id": msg_id,
        "conversation_id": "c1",
        "direction": "inbound",
        "media_url": "https://example.test/photo.jpg",
        "media_type": "image",
        "created_at": created_at,
    }


class _FakeGeminiClient:
    api_key = "test-gemini-key"


_FALLBACK = (_FakeGeminiClient(), "gemini-flash-lite-latest")


@patch("app.routers.chat.describe_patient_photo", return_value=("analysis", "النوع: بشرة دهنية", None))
def test_a_successful_classification_is_returned_with_no_audit_log_entry(_mock):
    db = _Db(messages=[_image_message()])
    text, kind, image_without_medical_description = _photo_description_for_turn(db, "c1", _FALLBACK)
    assert (text, kind) == ("النوع: بشرة دهنية", "analysis")
    assert image_without_medical_description is False
    assert db.tables["audit_log"].rows == []


@patch("app.routers.chat.describe_patient_photo", return_value=("receipt", None, None))
def test_a_receipt_classification_is_passed_through_as_its_own_kind(_mock):
    # It carries no description text, so it must not be mistaken for
    # "nothing came back" -- the kind alone is what routes the turn to
    # submit_payment_receipt.
    db = _Db(messages=[_image_message()])
    text, kind, image_without_medical_description = _photo_description_for_turn(db, "c1", _FALLBACK)
    assert (text, kind) == (None, "receipt")
    assert image_without_medical_description is False
    assert db.tables["audit_log"].rows == []


@patch("app.routers.chat.describe_patient_photo", return_value=(None, None, None))
def test_a_genuine_none_classification_is_a_receipt_candidate_not_a_failure(_mock):
    db = _Db(messages=[_image_message()])
    text, kind, image_without_medical_description = _photo_description_for_turn(db, "c1", _FALLBACK)
    assert (text, kind) == (None, None)
    assert image_without_medical_description is True
    assert db.tables["audit_log"].rows == []


@patch("app.routers.chat.describe_patient_photo", return_value=(None, None, "vision call failed: safety filter"))
def test_a_failed_classification_is_never_treated_as_a_receipt_candidate(_mock):
    # This is the exact bug: a failure used to look identical to "none",
    # which meant an unclassified photo (e.g. a graphic wound image the
    # vision model refused) could get auto-attached as a payment receipt.
    db = _Db(messages=[_image_message(msg_id="m1")])
    text, kind, image_without_medical_description = _photo_description_for_turn(db, "c1", _FALLBACK)
    assert (text, kind) == (None, None)
    assert image_without_medical_description is False

    entries = db.tables["audit_log"].rows
    assert len(entries) == 1
    assert entries[0]["entity_type"] == "photo_classification"
    assert entries[0]["entity_id"] == "m1"
    assert entries[0]["reason"] == "vision call failed: safety filter"


@patch("app.routers.chat.describe_patient_photo")
def test_no_image_this_turn_never_calls_the_vision_api(mock_describe):
    db = _Db(messages=[])
    text, kind, image_without_medical_description = _photo_description_for_turn(db, "c1", _FALLBACK)
    assert (text, kind, image_without_medical_description) == (None, None, False)
    mock_describe.assert_not_called()


@patch("app.routers.chat.describe_patient_photo")
def test_no_gemini_configured_skips_classification_without_crashing(mock_describe):
    db = _Db(messages=[_image_message()])
    text, kind, image_without_medical_description = _photo_description_for_turn(db, "c1", None)
    assert (text, kind, image_without_medical_description) == (None, None, False)
    mock_describe.assert_not_called()
    assert db.tables["audit_log"].rows == []
