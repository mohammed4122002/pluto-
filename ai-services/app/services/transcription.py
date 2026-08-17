import base64
import logging

import httpx

logger = logging.getLogger(__name__)

# Gemini's native generateContent endpoint, not the OpenAI-compatible shim
# used elsewhere in this codebase: the compat layer's audio support isn't
# reliably documented/tested against, while inline_data + a transcription
# prompt against this endpoint is Gemini's standard, well-documented way to
# transcribe audio. Same provider as the vision fallback (app/services/
# vision.py) and the text fallback in chat.py -- just called directly here
# instead of through the OpenAI SDK shim, since transcription is the one
# thing that shim isn't a safe bet for.
_GENERATE_CONTENT_URL = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"

_TRANSCRIBE_PROMPT = (
    "Transcribe this audio verbatim, in whatever language is spoken. Return only the "
    "transcribed text itself -- no commentary, no quotation marks, no translation, and "
    "nothing at all if the audio has no discernible speech."
)


def transcribe_voice_message(api_key: str, model: str, audio_url: str) -> tuple[str | None, str | None]:
    """Downloads a patient's voice note and transcribes it with Gemini, so
    the rest of the turn can treat it exactly like a typed message.

    Deliberately Gemini, not OpenAI/Whisper: this clinic (like most set up
    so far) already depends on a Gemini key for photo analysis and as the
    text fallback, while the OpenAI key is a separate, independently
    configurable credential that has already gone stale in production once
    (confirmed live: an expired/rotated OpenAI key silently broke every
    voice note with a 401, while text replies kept working the whole time
    because chat completions already had a Gemini fallback path -- voice
    transcription didn't, since it went through OpenAI/Whisper with no
    fallback at all). Riding the same key text/vision already need means
    one working Gemini key is enough for every AI feature this bot has.

    Returns (text, failure_reason). text is None whenever transcription
    didn't produce anything usable, in which case failure_reason is a short
    diagnostic string for audit_log (never shown to the patient).
    """
    try:
        response = httpx.get(audio_url, timeout=20)
        response.raise_for_status()
        audio_bytes = response.content
    except Exception as exc:
        logger.exception("failed to download voice note from %s", audio_url)
        return None, f"download failed: {exc}"

    try:
        gemini_response = httpx.post(
            _GENERATE_CONTENT_URL.format(model=model),
            params={"key": api_key},
            json={
                "contents": [
                    {
                        "parts": [
                            {"text": _TRANSCRIBE_PROMPT},
                            {
                                "inline_data": {
                                    "mime_type": "audio/ogg",
                                    "data": base64.b64encode(audio_bytes).decode("ascii"),
                                }
                            },
                        ]
                    }
                ]
            },
            timeout=30,
        )
        gemini_response.raise_for_status()
        data = gemini_response.json()
        text = data["candidates"][0]["content"]["parts"][0]["text"].strip()
    except Exception as exc:
        logger.exception("gemini transcription failed for %s", audio_url)
        return None, f"gemini transcription failed: {exc}"

    if not text:
        return None, "empty transcript (clip may be too short or silent)"
    return text, None
