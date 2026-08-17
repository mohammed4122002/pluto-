"""transcribe_voice_message: downloads a patient's voice note and runs it
through Whisper, so a voice message can be treated exactly like a typed
one everywhere downstream. Must never raise -- a patient waiting on a
reply after sending a voice note must always get *something* back, even
if the download or the transcription itself fails.
"""

import sys
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import httpx  # noqa: E402

from app.services.transcription import transcribe_voice_message  # noqa: E402


class _Transcript:
    def __init__(self, text):
        self.text = text


class _FakeTranscriptions:
    def __init__(self, text=None, error=None):
        self._text = text
        self._error = error
        self.calls = []

    def create(self, **kwargs):
        self.calls.append(kwargs)
        if self._error:
            raise self._error
        return _Transcript(self._text)


class _FakeAudio:
    def __init__(self, transcriptions):
        self.transcriptions = transcriptions


class _FakeClient:
    def __init__(self, text=None, error=None):
        self.transcriptions = _FakeTranscriptions(text, error)
        self.audio = _FakeAudio(self.transcriptions)


def _fake_response(content=b"fake-audio-bytes", status=200):
    request = httpx.Request("GET", "https://example.test/voice.ogg")
    return httpx.Response(status, content=content, request=request)


@patch("app.services.transcription.httpx.get")
def test_returns_the_transcribed_text(mock_get):
    mock_get.return_value = _fake_response()
    client = _FakeClient(text="بدي أحجز موعد بكرة الصبح")
    result = transcribe_voice_message(client, "https://example.test/voice.ogg")
    assert result == "بدي أحجز موعد بكرة الصبح"


@patch("app.services.transcription.httpx.get")
def test_the_downloaded_audio_actually_reaches_the_whisper_call(mock_get):
    mock_get.return_value = _fake_response(content=b"real-audio-bytes")
    client = _FakeClient(text="وصف")
    transcribe_voice_message(client, "https://example.test/voice.ogg")
    sent = client.audio.transcriptions.calls[0]
    assert sent["model"] == "whisper-1"
    assert sent["file"][1] == b"real-audio-bytes"


@patch("app.services.transcription.httpx.get")
def test_a_download_failure_returns_none_rather_than_raising(mock_get):
    mock_get.side_effect = httpx.ConnectError("connection refused")
    client = _FakeClient(text="لن يتم استدعاؤه")
    assert transcribe_voice_message(client, "https://example.test/voice.ogg") is None
    assert client.audio.transcriptions.calls == []


@patch("app.services.transcription.httpx.get")
def test_a_non_200_response_returns_none_rather_than_raising(mock_get):
    mock_get.return_value = _fake_response(status=404)
    client = _FakeClient(text="لن يتم استدعاؤه")
    assert transcribe_voice_message(client, "https://example.test/voice.ogg") is None


@patch("app.services.transcription.httpx.get")
def test_a_whisper_provider_error_returns_none_rather_than_raising(mock_get):
    mock_get.return_value = _fake_response()
    client = _FakeClient(error=RuntimeError("provider is down"))
    assert transcribe_voice_message(client, "https://example.test/voice.ogg") is None


@patch("app.services.transcription.httpx.get")
def test_an_empty_transcript_is_treated_as_no_transcription(mock_get):
    mock_get.return_value = _fake_response()
    client = _FakeClient(text="   ")
    assert transcribe_voice_message(client, "https://example.test/voice.ogg") is None
