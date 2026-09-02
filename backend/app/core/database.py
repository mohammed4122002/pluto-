from functools import lru_cache

import httpx
from supabase import Client, create_client

from app.core.config import get_settings


@lru_cache
def get_supabase() -> Client:
    settings = get_settings()
    client = create_client(settings.supabase_url, settings.supabase_service_key)
    # postgrest-py's default session multiplexes every request over one
    # http2 connection -- confirmed live: a burst of the dashboard's own
    # concurrent GETs (conversations, appointments, patients, ...) failed
    # together with httpx.ReadError "Resource temporarily unavailable" at
    # the exact same millisecond, then succeeded again seconds later. One
    # shared connection going stale (an idle-connection reset from
    # Supabase's own proxy, not anything this app did) takes every in-flight
    # request down with it. http1.1 with a real connection pool plus a
    # transport-level retry means a single stale connection only costs the
    # one request that hit it, and a fresh connect recovers automatically
    # instead of surfacing as a dashboard-wide 500.
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
