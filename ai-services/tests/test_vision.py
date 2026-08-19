"""describe_patient_photo: classifies a photo into urgent / analysis / none,
never a real diagnosis in any of the three.

Downloads the image itself and sends it inline (base64) to Gemini's
generateContent endpoint, rather than handing Gemini a remote URL to fetch
-- confirmed live, every vision call was failing with "Request contains an
invalid argument" (a 400, not a safety block) when sent as a remote
image_url the way OpenAI's own vision models accept.

Deliberately tested for what it must NOT do as much as what it does -- this
feeds straight into a booking assistant that patients trust as a real
receptionist, and a diagnostic-sounding sentence here would read to a
patient as actual medical advice from a clinic. "analysis" is allowed to
name common, low-stakes concerns (acne, pigmentation, hair loss...) by
their everyday name -- but never a real disease name, and never instead of
"urgent" when the photo looks like it needs real medical attention.

Returns (kind, text, failure_reason) rather than collapsing "explicitly
classified none" and "the call itself failed" into the same None: a real
failure needs to stay distinguishable from Gemini genuinely deciding a
photo isn't medical, so a caller never treats "unknown" as "confirmed not
medical" (see chat.py's _photo_description_for_turn).
"""

import sys
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import httpx  # noqa: E402

from app.services.vision import describe_patient_photo  # noqa: E402


def _fake_get_response(content=b"fake-image-bytes", status=200, content_type="image/jpeg"):
    request = httpx.Request("GET", "https://example.test/photo.jpg")
    return httpx.Response(status, content=content, headers={"content-type": content_type}, request=request)


def _fake_gemini_response(text=None, status=200):
    request = httpx.Request("POST", "https://generativelanguage.googleapis.com/v1beta/models/m:generateContent")
    body = {"candidates": [{"content": {"parts": [{"text": text}]}}]} if text is not None else {"candidates": []}
    return httpx.Response(status, json=body, request=request)


@patch("app.services.vision.httpx.post")
@patch("app.services.vision.httpx.get")
def test_analysis_response_is_parsed_with_its_body(mock_get, mock_post):
    mock_get.return_value = _fake_get_response()
    mock_post.return_value = _fake_gemini_response(text="ANALYSIS\nالنوع: بشرة دهنية/مختلطة\nالحالة العامة: تحتاج عناية")
    kind, text, failure_reason = describe_patient_photo("api-key", "gemini-flash-lite-latest", "https://example.test/photo.jpg")
    assert kind == "analysis"
    assert "بشرة دهنية" in text
    assert failure_reason is None


@patch("app.services.vision.httpx.post")
@patch("app.services.vision.httpx.get")
def test_urgent_response_is_parsed_with_its_body(mock_get, mock_post):
    mock_get.return_value = _fake_get_response()
    mock_post.return_value = _fake_gemini_response(text="URGENT\nصورة يد فيها احمرار وتقشّر واسع يمتد لعدة أصابع")
    kind, text, failure_reason = describe_patient_photo("api-key", "gemini-flash-lite-latest", "https://example.test/photo.jpg")
    assert kind == "urgent"
    assert "تقشّر" in text
    assert failure_reason is None


@patch("app.services.vision.httpx.post")
@patch("app.services.vision.httpx.get")
def test_the_downloaded_image_actually_reaches_the_gemini_call(mock_get, mock_post):
    mock_get.return_value = _fake_get_response(content=b"real-image-bytes", content_type="image/png")
    mock_post.return_value = _fake_gemini_response(text="ANALYSIS\nوصف")
    describe_patient_photo("api-key", "gemini-flash-lite-latest", "https://example.test/photo.jpg")
    sent = mock_post.call_args
    assert sent.kwargs["params"] == {"key": "api-key"}
    parts = sent.kwargs["json"]["contents"][0]["parts"]
    inline_data = parts[0]["inline_data"]
    assert inline_data["mime_type"] == "image/png"
    import base64

    assert base64.b64decode(inline_data["data"]) == b"real-image-bytes"
    assert sent.kwargs["json"]["systemInstruction"]["parts"][0]["text"]


@patch("app.services.vision.httpx.get")
def test_a_download_failure_is_a_failure_not_a_none_classification(mock_get):
    mock_get.side_effect = httpx.ConnectError("connection refused")
    kind, text, failure_reason = describe_patient_photo("api-key", "m", "https://example.test/x.jpg")
    assert (kind, text) == (None, None)
    assert "image download failed" in failure_reason


@patch("app.services.vision.httpx.post")
@patch("app.services.vision.httpx.get")
def test_none_response_means_not_a_relevant_photo_not_a_failure(mock_get, mock_post):
    mock_get.return_value = _fake_get_response()
    mock_post.return_value = _fake_gemini_response(text="NONE")
    result = describe_patient_photo("api-key", "m", "https://example.test/receipt.jpg")
    assert result == (None, None, None)


@patch("app.services.vision.httpx.post")
@patch("app.services.vision.httpx.get")
def test_a_receipt_is_its_own_classification_not_a_none(mock_get, mock_post):
    # Receipts and unidentifiable photos need opposite handling downstream
    # (submit the receipt vs. ask the patient what they sent), so they must
    # not collapse into the same answer the way they used to.
    mock_get.return_value = _fake_get_response()
    mock_post.return_value = _fake_gemini_response(text="RECEIPT")
    kind, text, failure_reason = describe_patient_photo("api-key", "m", "https://example.test/receipt.jpg")
    assert kind == "receipt"
    assert text is None
    assert failure_reason is None


@patch("app.services.vision.httpx.post")
@patch("app.services.vision.httpx.get")
def test_the_prompt_makes_body_vs_no_body_the_first_decision(mock_get, mock_post):
    # Pins the rule that keeps the two apart in both directions: a photo of
    # a body part is never a receipt, and a page of numbers is never a skin
    # condition.
    from app.services.vision import _VISION_SYSTEM_PROMPT

    assert "في بالصورة جزء من جسم إنسان أو لأ؟" in _VISION_SYSTEM_PROMPT
    assert "RECEIPT" in _VISION_SYSTEM_PROMPT


@patch("app.services.vision.httpx.post")
@patch("app.services.vision.httpx.get")
def test_none_response_is_case_and_punctuation_insensitive(mock_get, mock_post):
    mock_get.return_value = _fake_get_response()
    for raw in ["None", "none", "NONE.", "none، "]:
        mock_post.return_value = _fake_gemini_response(text=raw)
        result = describe_patient_photo("api-key", "m", "https://example.test/x.jpg")
        assert result == (None, None, None)


@patch("app.services.vision.httpx.post")
@patch("app.services.vision.httpx.get")
def test_empty_response_is_a_failure_not_a_none_classification(mock_get, mock_post):
    # A blank reply from the model is not the same as it looking at the
    # photo and deciding "not medical" -- callers must not conflate the two
    # (see describe_patient_photo's own docstring for the live incident this
    # distinction fixes).
    mock_get.return_value = _fake_get_response()
    mock_post.return_value = _fake_gemini_response(text="   ")
    kind, text, failure_reason = describe_patient_photo("api-key", "m", "https://example.test/x.jpg")
    assert kind is None
    assert text is None
    assert failure_reason is not None


@patch("app.services.vision.httpx.post")
@patch("app.services.vision.httpx.get")
def test_a_provider_error_is_a_failure_not_a_none_classification(mock_get, mock_post):
    # The patient is waiting on a reply -- a vision-call failure must never
    # break the turn, only fall back to a text-only reply. But it must also
    # never be silently treated as "confirmed not medical".
    mock_get.return_value = _fake_get_response()
    mock_post.return_value = _fake_gemini_response(status=401)
    kind, text, failure_reason = describe_patient_photo("bad-key", "m", "https://example.test/x.jpg")
    assert kind is None
    assert text is None
    assert "vision call failed" in failure_reason


@patch("app.services.vision.httpx.post")
@patch("app.services.vision.httpx.get")
def test_a_reply_with_no_recognizable_marker_still_surfaces_as_analysis(mock_get, mock_post):
    # A model that ignored the required first-word format must not silently
    # drop a real analysis on the floor -- better to treat it as a
    # (non-urgent) analysis than lose it entirely.
    mock_get.return_value = _fake_get_response()
    mock_post.return_value = _fake_gemini_response(text="بشرة فيها حبوب متوسطة الشدة")
    kind, text, failure_reason = describe_patient_photo("api-key", "m", "https://example.test/x.jpg")
    assert (kind, text) == ("analysis", "بشرة فيها حبوب متوسطة الشدة")
    assert failure_reason is None


def test_the_prompt_still_explicitly_bans_real_disease_names():
    # Not a behavioral test of the model itself (that's not testable here) --
    # pins that the system prompt still explicitly forbids real diagnostic
    # terms even in "analysis" mode, so a future edit can't silently drop
    # that guardrail while expanding what the model is allowed to name.
    from app.services.vision import _VISION_SYSTEM_PROMPT

    assert "ممنوع نهائياً اسم مرض جلدي طبي حقيقي" in _VISION_SYSTEM_PROMPT
    for term in ["إكزيما", "صدفية", "فطريات"]:
        assert term in _VISION_SYSTEM_PROMPT
