from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file="../.env", env_file_encoding="utf-8", extra="ignore")

    supabase_url: str
    supabase_service_key: str
    openai_api_key: str = ""

    # Fallback used only when an OpenAI call fails mid-turn (outage, rate
    # limit, ...) — see chat.py::_run_conversation_turn. Leave empty to
    # disable the fallback (a failed OpenAI call then degrades straight to
    # human handoff, as before).
    gemini_api_key: str = ""
    # Alias, not a pinned version, on purpose: pinned gemini-2.0-flash silently
    # lost its free-tier allocation (429 "limit: 0") and gemini-2.5-* got
    # retired for new keys, which took the fallback down exactly when OpenAI
    # was already failing. An alias keeps pointing at a model that still exists.
    gemini_model: str = "gemini-flash-latest"

    # Decrypts openai_api_key_encrypted/gemini_api_key_encrypted from the
    # ai_provider_settings table (set via the dashboard's AI settings page) —
    # same shared secret backend/app/core/security.py uses for MFA/channel
    # credentials. See chat.py::_load_provider_overrides.
    encryption_key: str = ""

    # Used to build the appointment QR-code image URL handed back to n8n
    # after a successful booking (fetched server-side with the service
    # token, then relayed to the patient as a photo — never linked in text).
    backend_public_url: str = ""

    # Shared secret validating machine-to-machine calls (e.g. the external
    # scheduler polling /chat/reclaim-stale) — same value/semantics as the
    # backend's SERVICE_TOKEN, see backend/app/core/config.py.
    service_token: str = ""
    service_auth_mode: str = "permissive"


@lru_cache
def get_settings() -> Settings:
    return Settings()
