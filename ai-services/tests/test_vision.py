"""describe_patient_photo: a visual description, never a diagnosis.

Deliberately tested for what it must NOT do as much as what it does -- this
feeds straight into a booking assistant that patients trust as a real
receptionist, and a diagnostic-sounding sentence here would read to a
patient as actual medical advice from a clinic.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.vision import describe_patient_photo  # noqa: E402


class _Message:
    def __init__(self, content):
        self.content = content


class _Choice:
    def __init__(self, content):
        self.message = _Message(content)


class _Response:
    def __init__(self, content):
        self.choices = [_Choice(content)]


class _FakeCompletions:
    def __init__(self, content=None, error=None):
        self._content = content
        self._error = error
        self.calls = []

    def create(self, **kwargs):
        self.calls.append(kwargs)
        if self._error:
            raise self._error
        return _Response(self._content)


class _FakeChat:
    def __init__(self, completions):
        self.completions = completions


class _FakeClient:
    def __init__(self, content=None, error=None):
        self.completions = _FakeCompletions(content, error)
        self.chat = _FakeChat(self.completions)


def test_returns_a_neutral_description():
    client = _FakeClient(content="صورة وجه فيها احمرار وحبوب صغيرة متفرقة على الخدين")
    result = describe_patient_photo(client, "gemini-flash-lite-latest", "https://example.test/photo.jpg")
    assert result == "صورة وجه فيها احمرار وحبوب صغيرة متفرقة على الخدين"


def test_the_image_actually_reaches_the_api_call():
    client = _FakeClient(content="وصف")
    describe_patient_photo(client, "gemini-flash-lite-latest", "https://example.test/photo.jpg")
    sent = client.completions.calls[0]
    image_parts = [
        part
        for msg in sent["messages"]
        if isinstance(msg["content"], list)
        for part in msg["content"]
        if part.get("type") == "image_url"
    ]
    assert image_parts and image_parts[0]["image_url"]["url"] == "https://example.test/photo.jpg"


def test_none_response_means_not_a_relevant_photo():
    client = _FakeClient(content="none")
    assert describe_patient_photo(client, "m", "https://example.test/receipt.jpg") is None


def test_none_response_is_case_and_punctuation_insensitive():
    for raw in ["None", "NONE", "none.", "none، "]:
        client = _FakeClient(content=raw)
        assert describe_patient_photo(client, "m", "https://example.test/x.jpg") is None


def test_empty_response_is_treated_as_no_description():
    client = _FakeClient(content="")
    assert describe_patient_photo(client, "m", "https://example.test/x.jpg") is None


def test_a_provider_error_returns_none_rather_than_raising():
    # The patient is waiting on a reply -- a vision-call failure must never
    # break the turn, only fall back to a text-only reply.
    client = _FakeClient(error=RuntimeError("provider is down"))
    assert describe_patient_photo(client, "m", "https://example.test/x.jpg") is None
