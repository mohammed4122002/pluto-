import logging

import httpx
from openai import OpenAI

logger = logging.getLogger(__name__)


def transcribe_voice_message(client: OpenAI, audio_url: str) -> str | None:
    """Downloads a patient's voice note and transcribes it with Whisper, so
    the rest of the turn can treat it exactly like a typed message. Returns
    None on any failure (download or transcription) — the calling turn must
    degrade gracefully (ask the patient to resend or type instead), never
    crash on a bad/expired media URL or a transient provider error.

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
    except Exception:
        logger.exception("failed to download voice note from %s", audio_url)
        return None

    try:
        transcript = client.audio.transcriptions.create(
            model="whisper-1",
            file=("voice.ogg", audio_bytes, "audio/ogg"),
        )
    except Exception:
        logger.exception("whisper transcription failed for %s", audio_url)
        return None

    text = (transcript.text or "").strip()
    return text or None
