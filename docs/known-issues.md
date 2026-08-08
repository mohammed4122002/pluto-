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

## WhatsApp channel: fully built in code, blocked on Meta account setup

**Status**: not a bug. Everything on our side of a WhatsApp patient channel is
implemented and matches the Telegram path. What is missing is entirely
external account/credential setup, so it is worth writing down precisely
what is and is not done before anyone re-implements it by mistake.

**Already implemented**:

- Dashboard: `whatsapp` is offered in the Channels screen's provider list,
  with its own label, icon, and credential fields (`ChannelsPage.tsx`).
- Backend: `ChannelType` includes it; `REQUIRED_FIELDS` declares
  `phone_number_id` / `waba_id` / `access_token`; `verify_credentials` makes a
  real Meta Graph call before anything is saved; `send_test_message` sends a
  real message; adding the channel wires `outbound_webhook_url` and flips
  `is_active` (`services/channel_providers.py`, `routers/channels.py`).
- n8n: workflow "Clinic WhatsApp Bot" (`1EHc8IWCoQbmmYSC`) mirrors the
  Telegram flow — inbound trigger, channel lookup by phone number id, the
  shared "Agent Core" brain, outbound send, plus a webhook for staff replies.
  It also now handles inbound receipt images and sends the check-in QR, which
  it previously lacked (Telegram had both).

Unlike Telegram, ONE workflow serves every WhatsApp number: the access token
is fetched per-message from `GET /channels?identifier=` rather than stored as
an n8n credential. That is why "Prepare AI Send" / "Prepare Manual Send" hold
`accessToken` as a Set field and n8n's linter flags it — moving it into an
n8n credential would break multi-number support. The warning is expected.

**What actually blocks it** (none of it is code):

1. A Meta Business account with a verified WhatsApp Business number, plus a
   System User access token and the number's Phone Number ID. This is Meta's
   own business-verification process and cannot be shortcut.
2. A Facebook/Meta app credential created in n8n and attached to the
   workflow's trigger node. Webhook verification is automatic once attached.
3. Publishing the workflow. It is deliberately left unpublished: with no
   trigger credential it would fail at runtime, and an "active" workflow that
   cannot receive anything is worse than an obviously inactive one.

**Not verified end to end.** The receipt-image and QR paths were built from
the proven Telegram node shapes but could not be executed even once, because
there is no WhatsApp number to receive a message from. Expect to debug them
on the first real message rather than assuming they work. The most likely
failure points, in order: the two-step Meta media download (media id -> URL
-> bytes), and whether the `httpHeaderAuth` credentials on the storage/QR
nodes survived being set over the API — that field is not readable back
through the n8n API, so it must be confirmed by eye in the n8n editor.
