import logging

from fastapi import Header, HTTPException, Request

from app.core.config import get_settings

logger = logging.getLogger("service_auth")


def require_service_token(request: Request, x_service_token: str | None = Header(default=None)) -> None:
    """Gates the machine-to-machine endpoints an external scheduler calls
    directly (no staff login involved) — mirrors backend/app/core/service_auth.py.
    "permissive" logs a warning on a missing/wrong token but still lets the
    request through; "strict" rejects with 401."""
    settings = get_settings()
    valid = bool(settings.service_token) and x_service_token == settings.service_token
    if valid:
        return

    client = request.client.host if request.client else "unknown"
    if settings.service_auth_mode == "strict":
        logger.warning("service_auth REJECTED %s %s from %s (strict mode)", request.method, request.url.path, client)
        raise HTTPException(status_code=401, detail="Invalid or missing service token")

    logger.warning(
        "service_auth: missing/invalid X-Service-Token on %s %s from %s — ALLOWED (permissive mode, rollout in progress)",
        request.method,
        request.url.path,
        client,
    )
