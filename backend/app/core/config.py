from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file="../.env", env_file_encoding="utf-8", extra="ignore")

    supabase_url: str
    supabase_service_key: str
    ai_service_url: str = "http://localhost:8100"
    cors_origins: list[str] = ["http://localhost:5173"]

    jwt_secret: str
    encryption_key: str

    # Shared secret n8n sends on machine-to-machine calls (inbound message
    # webhook, payment-receipt webhook, reminder-cron trigger). "permissive"
    # logs a warning and still allows the request through — used during the
    # rollout window before every n8n workflow is updated to send the header;
    # flip to "strict" once confirmed to actually reject.
    service_token: str = ""
    service_auth_mode: str = "permissive"

    n8n_api_base_url: str = ""
    n8n_rest_api_key: str = ""
    n8n_telegram_template_workflow_id: str = ""
    backend_public_url: str = ""
    ai_service_public_url: str = ""


@lru_cache
def get_settings() -> Settings:
    return Settings()
