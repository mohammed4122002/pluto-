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
    result = describe_patient_photo(client, "gemini-flash-lite-latest", "https://example.test/photo.jpg")
    assert result[0] == "analysis"
    assert "بشرة دهنية" in result[1]


def test_urgent_response_is_parsed_with_its_body():
    client = _FakeClient(content="URGENT\nصورة يد فيها احمرار وتقشّر واسع يمتد لعدة أصابع")
    result = describe_patient_photo(client, "gemini-flash-lite-latest", "https://example.test/photo.jpg")
    assert result[0] == "urgent"
    assert "تقشّر" in result[1]


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


def test_none_response_means_not_a_relevant_photo():
    client = _FakeClient(content="NONE")
    assert describe_patient_photo(client, "m", "https://example.test/receipt.jpg") is None


def test_none_response_is_case_and_punctuation_insensitive():
    for raw in ["None", "none", "NONE.", "none، "]:
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


def test_a_reply_with_no_recognizable_marker_still_surfaces_as_analysis():
    # A model that ignored the required first-word format must not silently
    # drop a real analysis on the floor -- better to treat it as a
    # (non-urgent) analysis than lose it entirely.
    client = _FakeClient(content="بشرة فيها حبوب متوسطة الشدة")
    result = describe_patient_photo(client, "m", "https://example.test/x.jpg")
    assert result == ("analysis", "بشرة فيها حبوب متوسطة الشدة")


def test_the_prompt_still_explicitly_bans_real_disease_names():
    # Not a behavioral test of the model itself (that's not testable here) --
    # pins that the system prompt still explicitly forbids real diagnostic
    # terms even in "analysis" mode, so a future edit can't silently drop
    # that guardrail while expanding what the model is allowed to name.
    from app.services.vision import _VISION_SYSTEM_PROMPT

    assert "ممنوع نهائياً اسم مرض جلدي طبي حقيقي" in _VISION_SYSTEM_PROMPT
    for term in ["إكزيما", "صدفية", "فطريات"]:
        assert term in _VISION_SYSTEM_PROMPT
