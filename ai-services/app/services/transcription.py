import logging

import httpx
from openai import OpenAI

logger = logging.getLogger(__name__)


def transcribe_voice_message(client: OpenAI, audio_url: str) -> tuple[str | None, str | None]:
    """Downloads a patient's voice note and transcribes it with Whisper, so
    the rest of the turn can treat it exactly like a typed message.

    Returns (text, failure_reason). text is None whenever transcription
    didn't produce anything usable, in which case failure_reason is a short
    diagnostic string for audit_log (never shown to the patient) — a real
    failure (download error, provider outage) needs to be distinguishable
    from Whisper genuinely returning nothing for a near-silent or
    sub-second clip, instead of both looking identical with no way to tell
    which one actually happened after the fact.

    Always the primary OpenAI client, never the Gemini fallback: Gemini's
    OpenAI-compatible endpoint doesn't expose /audio/transcriptions, and
    this endpoint already requires a real OpenAI key to be configured just
    to reach this code path (_get_openai is a required dependency of
    /chat/reply), so it's never a case of "no key at all" here.
    """
    try:
        response = httpx.get(audio_url, timeout=20)
        response.raise_for_status()
        audio_bytes = response.content
    except Exception as exc:
        logger.exception("failed to download voice note from %s", audio_url)
        return None, f"download failed: {exc}"

    try:
        transcript = client.audio.transcriptions.create(
            model="whisper-1",
            file=("voice.ogg", audio_bytes, "audio/ogg"),
        )
    except Exception as exc:
        logger.exception("whisper transcription failed for %s", audio_url)
        return None, f"whisper failed: {exc}"

    text = (transcript.text or "").strip()
    if not text:
        return None, "empty transcript (clip may be too short or silent)"
    return text, None
