"""describe_patient_photo: classifies a photo into urgent / analysis / none,
never a real diagnosis in any of the three.

Deliberately tested for what it must NOT do as much as what it does -- this
feeds straight into a booking assistant that patients trust as a real
receptionist, and a diagnostic-sounding sentence here would read to a
patient as actual medical advice from a clinic. "analysis" is allowed to
name common, low-stakes concerns (acne, pigmentation, hair loss...) by
their everyday name -- but never a real disease name, and never instead of
"urgent" when the photo looks like it needs real medical attention.
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


def test_analysis_response_is_parsed_with_its_body():
    client = _FakeClient(content="ANALYSIS\nالنوع: بشرة دهنية/مختلطة\nالحالة العامة: تحتاج عناية")
    kind, text, failure_reason = describe_patient_photo(client, "gemini-flash-lite-latest", "https://example.test/photo.jpg")
    assert kind == "analysis"
    assert "بشرة دهنية" in text
    assert failure_reason is None


def test_urgent_response_is_parsed_with_its_body():
    client = _FakeClient(content="URGENT\nصورة يد فيها احمرار وتقشّر واسع يمتد لعدة أصابع")
    kind, text, failure_reason = describe_patient_photo(client, "gemini-flash-lite-latest", "https://example.test/photo.jpg")
    assert kind == "urgent"
    assert "تقشّر" in text
    assert failure_reason is None


def test_the_image_actually_reaches_the_api_call():
    client = _FakeClient(content="ANALYSIS\nوصف")
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


def test_none_response_means_not_a_relevant_photo_not_a_failure():
    client = _FakeClient(content="NONE")
    kind, text, failure_reason = describe_patient_photo(client, "m", "https://example.test/receipt.jpg")
    assert (kind, text, failure_reason) == (None, None, None)


def test_none_response_is_case_and_punctuation_insensitive():
    for raw in ["None", "none", "NONE.", "none، "]:
        client = _FakeClient(content=raw)
        kind, text, failure_reason = describe_patient_photo(client, "m", "https://example.test/x.jpg")
        assert (kind, text, failure_reason) == (None, None, None)


def test_empty_response_is_a_failure_not_a_none_classification():
    # A blank reply from the model is not the same as it looking at the
    # photo and deciding "not medical" -- callers must not conflate the two
    # (see describe_patient_photo's docstring for the live incident this
    # distinction fixes).
    client = _FakeClient(content="")
    kind, text, failure_reason = describe_patient_photo(client, "m", "https://example.test/x.jpg")
    assert kind is None
    assert text is None
    assert failure_reason is not None


def test_a_provider_error_is_a_failure_not_a_none_classification():
    # The patient is waiting on a reply -- a vision-call failure must never
    # break the turn, only fall back to a text-only reply. But it must also
    # never be silently treated as "confirmed not medical" -- a safety
    # filter blocking a graphic photo looks identical to a provider outage
    # here, and neither one means the photo was actually classified.
    client = _FakeClient(error=RuntimeError("provider is down"))
    kind, text, failure_reason = describe_patient_photo(client, "m", "https://example.test/x.jpg")
    assert kind is None
    assert text is None
    assert "provider is down" in failure_reason


def test_a_reply_with_no_recognizable_marker_still_surfaces_as_analysis():
    # A model that ignored the required first-word format must not silently
    # drop a real analysis on the floor -- better to treat it as a
    # (non-urgent) analysis than lose it entirely.
    client = _FakeClient(content="بشرة فيها حبوب متوسطة الشدة")
    kind, text, failure_reason = describe_patient_photo(client, "m", "https://example.test/x.jpg")
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
