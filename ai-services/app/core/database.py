from functools import lru_cache

import httpx
from supabase import Client, create_client

from app.core.config import get_settings


@lru_cache
def get_supabase() -> Client:
    settings = get_settings()
    client = create_client(settings.supabase_url, settings.supabase_service_key)
    # Same fix as backend/app/core/database.py::get_supabase -- postgrest-py's
    # default session multiplexes every request over one http2 connection,
    # so a single stale/reset connection (an idle-connection reset from
    # Supabase's own proxy) takes down every concurrent call sharing it at
    # once. http1.1 with a real connection pool plus a transport-level retry
    # means one stale connection only costs the request that hit it.
    client.postgrest.session = httpx.Client(
        base_url=client.postgrest.session.base_url,
        headers=client.postgrest.session.headers,
        timeout=client.postgrest.session.timeout,
        follow_redirects=True,
        http2=False,
        limits=httpx.Limits(max_connections=20, max_keepalive_connections=10, keepalive_expiry=5),
        transport=httpx.HTTPTransport(retries=2),
    )
    return client
