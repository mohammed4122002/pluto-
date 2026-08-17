"""transcribe_voice_message: downloads a patient's voice note and runs it
through Gemini's generateContent endpoint, so a voice message can be
treated exactly like a typed one everywhere downstream. Must never raise --
a patient waiting on a reply after sending a voice note must always get
*something* back, even if the download or the transcription itself fails.

Gemini, not OpenAI/Whisper: confirmed live, an expired/rotated OpenAI key
silently broke every voice note (a 401 from Whisper) while text replies
kept working the whole time because chat completions already had a Gemini
fallback path. Riding the same Gemini key vision already depends on avoids
a second, independently-failing credential.

Returns (text, failure_reason) rather than just text-or-None: a real
failure (bad download, provider outage) needs to stay distinguishable from
Gemini genuinely returning nothing for a near-silent/sub-second clip, so
whichever happened is visible afterward (see chat.py's
_transcribe_voice_note_for_turn, which logs failure_reason to audit_log)
instead of both looking identical.
"""

import sys
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import httpx  # noqa: E402

from app.services.transcription import transcribe_voice_message  # noqa: E402


def _fake_get_response(content=b"fake-audio-bytes", status=200):
    request = httpx.Request("GET", "https://example.test/voice.ogg")
    return httpx.Response(status, content=content, request=request)


def _fake_gemini_response(text=None, status=200):
    request = httpx.Request("POST", "https://generativelanguage.googleapis.com/v1beta/models/m:generateContent")
    body = {"candidates": [{"content": {"parts": [{"text": text}]}}]} if text is not None else {"candidates": []}
    return httpx.Response(status, json=body, request=request)


@patch("app.services.transcription.httpx.post")
@patch("app.services.transcription.httpx.get")
def test_returns_the_transcribed_text_with_no_failure_reason(mock_get, mock_post):
    mock_get.return_value = _fake_get_response()
    mock_post.return_value = _fake_gemini_response(text="بدي أحجز موعد بكرة الصبح")
    text, failure_reason = transcribe_voice_message("api-key", "gemini-flash-lite-latest", "https://example.test/voice.ogg")
    assert text == "بدي أحجز موعد بكرة الصبح"
    assert failure_reason is None


@patch("app.services.transcription.httpx.post")
@patch("app.services.transcription.httpx.get")
def test_the_downloaded_audio_actually_reaches_the_gemini_call(mock_get, mock_post):
    mock_get.return_value = _fake_get_response(content=b"real-audio-bytes")
    mock_post.return_value = _fake_gemini_response(text="وصف")
    transcribe_voice_message("api-key", "gemini-flash-lite-latest", "https://example.test/voice.ogg")
    sent = mock_post.call_args
    assert sent.kwargs["params"] == {"key": "api-key"}
    parts = sent.kwargs["json"]["contents"][0]["parts"]
    inline_data = next(p["inline_data"] for p in parts if "inline_data" in p)
    assert inline_data["mime_type"] == "audio/ogg"
    import base64

    assert base64.b64decode(inline_data["data"]) == b"real-audio-bytes"


@patch("app.services.transcription.httpx.get")
def test_a_download_failure_returns_none_with_a_diagnostic_reason(mock_get):
    mock_get.side_effect = httpx.ConnectError("connection refused")
    text, failure_reason = transcribe_voice_message("api-key", "m", "https://example.test/voice.ogg")
    assert text is None
    assert "download failed" in failure_reason


@patch("app.services.transcription.httpx.get")
def test_a_non_200_download_response_returns_none_rather_than_raising(mock_get):
    mock_get.return_value = _fake_get_response(status=404)
    text, failure_reason = transcribe_voice_message("api-key", "m", "https://example.test/voice.ogg")
    assert text is None
    assert failure_reason is not None


@patch("app.services.transcription.httpx.post")
@patch("app.services.transcription.httpx.get")
def test_a_gemini_provider_error_returns_none_with_a_diagnostic_reason(mock_get, mock_post):
    mock_get.return_value = _fake_get_response()
    mock_post.return_value = _fake_gemini_response(status=401)
    text, failure_reason = transcribe_voice_message("bad-key", "m", "https://example.test/voice.ogg")
    assert text is None
    assert "gemini transcription failed" in failure_reason


@patch("app.services.transcription.httpx.post")
@patch("app.services.transcription.httpx.get")
def test_an_empty_transcript_is_treated_as_no_transcription(mock_get, mock_post):
    mock_get.return_value = _fake_get_response()
    mock_post.return_value = _fake_gemini_response(text="   ")
    text, failure_reason = transcribe_voice_message("api-key", "m", "https://example.test/voice.ogg")
    assert text is None
    assert "empty transcript" in failure_reason


@patch("app.services.transcription.httpx.post")
@patch("app.services.transcription.httpx.get")
def test_no_speech_detected_at_all_is_treated_as_no_transcription(mock_get, mock_post):
    # Gemini returns no candidates at all for audio with no discernible speech.
    mock_get.return_value = _fake_get_response()
    mock_post.return_value = _fake_gemini_response(text=None)
    text, failure_reason = transcribe_voice_message("api-key", "m", "https://example.test/voice.ogg")
    assert text is None
    assert failure_reason is not None
