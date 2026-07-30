import time
from collections import defaultdict, deque
from threading import Lock

from fastapi import HTTPException, Request

# Simple in-memory sliding-window limiter. Fine for this template's
# single-process deployment (one backend container) — would need a shared
# store (e.g. Redis) if the backend is ever scaled to multiple instances.
_WINDOW_SECONDS = 60
_MAX_REQUESTS = 20

_hits: dict[str, deque] = defaultdict(deque)
_lock = Lock()


def rate_limit_receipt_submission(request: Request) -> None:
    key = request.client.host if request.client else "unknown"
    now = time.monotonic()
    with _lock:
        q = _hits[key]
        while q and now - q[0] > _WINDOW_SECONDS:
            q.popleft()
        if len(q) >= _MAX_REQUESTS:
            raise HTTPException(status_code=429, detail="طلبات كثيرة جداً — حاول بعد قليل")
        q.append(now)
