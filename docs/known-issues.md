# Known issues

## "Network Error" / CORS-looking failures in local development (Windows only)

**Symptom**: while running the backend and frontend locally on Windows, dashboard
pages occasionally show a red `Network Error` banner, and the browser console
logs something like:

```
Access to XMLHttpRequest at 'http://localhost:8000/...' from origin
'http://localhost:5173' has been blocked by CORS policy: No
'Access-Control-Allow-Origin' header is present on the requested resource.
```

This looks like a CORS misconfiguration but isn't one — Chromium shows that
exact message whenever a request's connection dies before any response
(headers included) comes back, regardless of the real cause.

**Real cause**: the backend's local `uvicorn` log will show, at the same
moment, a Python traceback ending in:

```
httpx.ReadError: [WinError 10035] A non-blocking socket operation could not be completed immediately
```

`WinError 10035` is `WSAEWOULDBLOCK`, a Windows Winsock error code. It shows
up when several concurrent outbound HTTPS connections to Supabase are opened
at once from FastAPI's thread pool — nearly every dashboard page fires 4-6
concurrent calls on mount via `Promise.all(...)`, and each one spawns a
worker thread that calls the synchronous `supabase-py`/`httpx` client
(`app/core/database.py`'s `get_supabase()`, an `@lru_cache`d singleton whose
underlying httpx connection pool is shared across every request thread).
Under that kind of concurrent burst, Windows' non-blocking socket layer
occasionally chokes. It is intermittent — the exact same request usually
succeeds on a retry (reload the page, or navigate away and back) with no
code changes.

**When it appears**: local development on Windows only, under concurrent
request bursts. It is not specific to any one page or feature — it
reproduces on pages that existed long before this was first noticed,
whenever enough concurrent requests fire.

**Why it cannot be a real bug in this scenario**: `WinError 10035` is a
Windows-only Winsock error code with no Linux equivalent failure mode. The
production backend runs on Railway (Linux), so this exact symptom cannot
occur there.

## How to tell this apart from a genuine failure

1. Check the local backend terminal/log for the `WinError 10035` traceback
   at the moment of the failure. If it's there, this is the known issue.
2. A genuine bug reproduces on a single, isolated request — not only under
   concurrent bursts — and the backend log will show either a real
   application exception (not this specific WinError), a clean 4xx/5xx with
   a meaningful `detail` message, or no matching request at all (meaning it
   never reached the backend).
3. If the same symptom shows up against the **production** URL rather than
   `localhost`, it is *not* this issue — treat it as a real bug and
   investigate normally.
4. Quick sanity check: reload or retry. If it then succeeds with zero code
   changes, and the log shows the WinError trace, log it as this known
   issue rather than a regression.

Not fixed as of this writing since it's a local-Windows-dev-only artifact
with no production impact. A future fix, if ever worth the effort, would
most likely involve replacing the shared synchronous `httpx`/`supabase-py`
client with either a per-request client or an async Supabase client, so
concurrent request threads stop sharing one connection pool.
