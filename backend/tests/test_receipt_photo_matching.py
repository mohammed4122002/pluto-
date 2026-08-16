"""attach_receipt_from_inbound_media: a photo only counts as a receipt if it
arrives reasonably soon after the patient was actually asked for one.

Found live: a patient with an old, otherwise-forgotten pending payment sent
an unrelated photo and was told "we received your payment receipt,
reviewing it now" -- the function's own docstring already claimed an
unrelated photo shouldn't attach to something stale, but nothing ever
checked *when* the payment was asked about, only *whether* one existed.
"""

import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.payments import attach_receipt_from_inbound_media  # noqa: E402
from tests.fake_supabase import FakeSupabase  # noqa: E402

PATIENT = "p1"
IMAGE_URL = "https://example.test/photo.jpg"


def _iso(delta: timedelta) -> str:
    return (datetime.now(timezone.utc) - delta).isoformat()


def _db(payments: list[dict]) -> FakeSupabase:
    return FakeSupabase({"payments": payments})


@patch("app.services.payments._resolve_channel_for_patient", return_value=None)
def test_matches_a_payment_asked_about_recently(_no_channel):
    db = _db(
        [
            {
                "id": "pay-1",
                "patient_id": PATIENT,
                "status": "pending",
                "payment_instructions_sent_at": _iso(timedelta(hours=2)),
                "verified_at": None,
                "created_at": _iso(timedelta(hours=2)),
            }
        ]
    )
    result = attach_receipt_from_inbound_media(db, PATIENT, IMAGE_URL)
    assert result is not None
    assert db._tables["payments"][0]["status"] == "receipt_submitted"
    assert db._tables["payments"][0]["receipt_image_url"] == IMAGE_URL


@patch("app.services.payments._resolve_channel_for_patient", return_value=None)
def test_does_not_match_a_payment_asked_about_long_ago(_no_channel):
    # This is the exact bug: an old pending payment nobody followed up on
    # must not claim a photo sent for an unrelated reason days/weeks later.
    db = _db(
        [
            {
                "id": "pay-1",
                "patient_id": PATIENT,
                "status": "pending",
                "payment_instructions_sent_at": _iso(timedelta(days=10)),
                "verified_at": None,
                "created_at": _iso(timedelta(days=10)),
            }
        ]
    )
    result = attach_receipt_from_inbound_media(db, PATIENT, IMAGE_URL)
    assert result is None
    assert db._tables["payments"][0]["status"] == "pending"
    assert db._tables["payments"][0].get("receipt_image_url") is None


@patch("app.services.payments._resolve_channel_for_patient", return_value=None)
def test_matches_a_rejected_payment_the_patient_was_recently_asked_to_retry(_no_channel):
    db = _db(
        [
            {
                "id": "pay-1",
                "patient_id": PATIENT,
                "status": "rejected",
                "payment_instructions_sent_at": _iso(timedelta(days=5)),
                "verified_at": _iso(timedelta(hours=1)),  # when it was rejected
                "created_at": _iso(timedelta(days=5)),
            }
        ]
    )
    result = attach_receipt_from_inbound_media(db, PATIENT, IMAGE_URL)
    assert result is not None
    assert db._tables["payments"][0]["status"] == "receipt_submitted"


@patch("app.services.payments._resolve_channel_for_patient", return_value=None)
def test_does_not_match_a_payment_rejected_long_ago(_no_channel):
    db = _db(
        [
            {
                "id": "pay-1",
                "patient_id": PATIENT,
                "status": "rejected",
                "payment_instructions_sent_at": _iso(timedelta(days=20)),
                "verified_at": _iso(timedelta(days=10)),
                "created_at": _iso(timedelta(days=20)),
            }
        ]
    )
    assert attach_receipt_from_inbound_media(db, PATIENT, IMAGE_URL) is None


def test_no_pending_or_rejected_payment_at_all():
    db = _db([])
    assert attach_receipt_from_inbound_media(db, PATIENT, IMAGE_URL) is None


@patch("app.services.payments._resolve_channel_for_patient", return_value=None)
def test_a_pending_payment_missing_the_asked_at_timestamp_is_not_matched(_no_channel):
    # Defensive: a row that somehow never got payment_instructions_sent_at
    # set must not be treated as "asked about right now".
    db = _db(
        [
            {
                "id": "pay-1",
                "patient_id": PATIENT,
                "status": "pending",
                "payment_instructions_sent_at": None,
                "verified_at": None,
                "created_at": _iso(timedelta(hours=1)),
            }
        ]
    )
    assert attach_receipt_from_inbound_media(db, PATIENT, IMAGE_URL) is None
