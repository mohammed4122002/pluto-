from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file="../.env", env_file_encoding="utf-8", extra="ignore")

    supabase_url: str
    supabase_service_key: str
    openai_api_key: str = ""

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
