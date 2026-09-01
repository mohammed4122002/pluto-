# n8n workflows — reference exports

Source of truth lives in the n8n instance itself; these JSON files are
importable reference exports of what's built there. Re-export and commit
here after any change made directly in n8n's UI, so this directory stays in
sync.

All 10 workflows below were also created directly in the live n8n instance
via the n8n MCP server (see "Live workflow IDs"). Importing these JSON files
is only needed to rebuild them on a *different* n8n instance, or to recover
one that got deleted.

## Import

In n8n: **Workflows → Import from File**, pick one of the JSON files here.

## Before activating any of them

This n8n instance's `httpRequest` node will not accept a *newly created*
`httpTemplatedCustomAuth`/Custom Auth credential from its own UI, so the
live workflows do **not** use an n8n credential for backend/ai-services auth
at all. Instead, every `HTTP Request` node calling the backend or
ai-services sends a static `X-Service-Token` header with the token value
pasted directly into the node's `headerParameters`, and `authentication` set
to `none`. Some files in this directory still show the older
`genericCredentialType`/`httpTemplatedCustomAuth` pattern from before this
was worked around — if you import one of those, either recreate the
`PLUTO Service Token` credential the old way (if your instance accepts it)
or just replace `authentication: "genericCredentialType"` with
`authentication: "none"` and add the `X-Service-Token` header manually,
matching `clinic-telegram-bot-template.json` (already updated).

1. On each `HTTP Request` node calling the backend or ai-services, set the
   `X-Service-Token` header value to the backend/ai-services `SERVICE_TOKEN`
   env var.
2. Some exports here also still carry pre-migration Railway URLs — update
   any `clinic-backend-*`/`clinic-ai-services-*` URL to your current Railway
   domains before activating.
3. Activate the workflow.

## Scheduled workflows (cron)

| File | Workflow | Cadence | Endpoint(s) |
| --- | --- | --- | --- |
| `appointment-reminders.json` | PLUTO — Appointment Reminders | every 5 min | backend `/notifications/process-due` |
| `waitlist-expire-offers.json` | PLUTO — Waitlist: expire offers | hourly | backend `/waitlist/process-expired` |
| `appointments-expire-unconfirmed.json` | PLUTO — Appointments: expire past unconfirmed | hourly | backend `/appointments/process-expired` |
| `queue-close-out-yesterday.json` | PLUTO — Queue: close out yesterday | nightly 00:15 | backend `/queues/process-stale` |
| `packages-expiry-reminders.json` | PLUTO — Packages: expiry reminders + renewal | daily 08:00 | backend `/patient-packages/process-expiring` |
| `recalls-invitations-escalation.json` | PLUTO — Recalls: invitations + escalation | daily 08:30 | backend `/recalls/process-due` + `/recalls/escalate-overdue` |
| `weekly-report.json` | PLUTO — Weekly Report | Monday 07:00 | backend `/reports/send-weekly` |
| `reclaim-stale-conversations.json` | PLUTO — Reclaim Stale Conversations | every 10 min | ai-services `/chat/reclaim-stale` |

All times are Asia/Amman (set on each workflow's Settings → Timezone — a
cron expression alone fires in the n8n instance's own timezone, not the
clinic's). Cadences for reminders/reclaim-stale weren't pinned down by an
existing SLA — adjust the `Schedule Trigger` node if the clinic needs a
different frequency.

`imports/sheets-sync/process-due` is a scheduled backend endpoint (see the
root README's table) with no workflow here yet — wire it the same way
(`Schedule Trigger` → `HTTP Request` → backend
`/imports/sheets-sync/process-due`) if Google Sheets imports are in use.

## Channel workflows

| File | Workflow | Role |
| --- | --- | --- |
| `clinic-telegram-bot-template.json` | Clinic Telegram Bot | **Template only — never activate directly.** `backend/app/core/n8n_client.py::clone_telegram_workflow()` clones this per Telegram channel added from the dashboard, rewriting the `channelId` placeholder in "Normalize & Config", the per-channel path on "Outbound Send Webhook", and every Telegram node's credential to that channel's own bot token. |
| `whatsapp-channel-relay.json` | PLUTO — WhatsApp Channel Relay | **One shared, already-activatable workflow** for every branch's WhatsApp number — see below. |

### Telegram

The template's live workflow ID must be set as `N8N_TELEGRAM_TEMPLATE_WORKFLOW_ID`
in the backend's environment (Railway: `railway variables --set
N8N_TELEGRAM_TEMPLATE_WORKFLOW_ID=<id> -s clinic-backend`, then
`railway redeploy -s clinic-backend -y`). Once set, adding a Telegram
channel from the dashboard clones + activates a bot automatically — nothing
else to do per-channel.

**Media handling (photos + QR booking confirmations):** the template now
downloads inbound Telegram photos (`Telegram Trigger`'s
`additionalFields.download`), uploads them to the Supabase Storage
`chat-media` bucket via `Upload Photo To Storage`, and passes the resulting
public URL as `media_url`/`media_type` to both `/conversations/inbound` and
`/chat/reply` — this is what lets ai-services' `describe_patient_photo`
analyze a symptom photo, and lets the backend attach a photo as a payment
receipt via `attach_receipt_from_inbound_media`. On the way out, if
`/chat/reply` just confirmed a booking it returns an `image_url` (a QR
code); `Has QR Image?` → `Fetch QR Image` → `Send QR Photo` fetches it with
the service token and relays it back to the patient as a real Telegram
photo (never as a raw link). Replace the `REPLACE_WITH_SUPABASE_*`
placeholders in `Upload Photo To Storage` (`apikey`/`Authorization` headers,
using the Supabase **service role** key — never the anon key — and the
project ref in the URL) before activating a clone built from this template
file; a channel cloned directly from the live n8n template already has
these filled in.

**Voice notes.** `Has Voice?` (checked when there's no photo) downloads a
Telegram voice message via `Download Voice` (the Telegram node's `file`/`get`
operation on `message.voice.file_id`, using the channel's own bot
credential — Telegram's trigger-level `download` option only auto-fetches
photos, never voice) and uploads it to `chat-media` the same way, setting
`media_type=audio`. This isn't cosmetic: ai-services' `/chat/reply` only
transcribes a voice note (via Gemini) when it sees `media_type=="audio"` —
without this branch, a voice message arrives with no `media_url` at all, the
AI turn sees an empty message, and the model reasonably (if unhelpfully)
escalates to a human instead of replying. Confirmed live on 2026-09-01: two
separate conversations went silent within 3 seconds of an inbound message
with empty `content`/`media_type` — the exact signature of an unhandled
voice note — before this branch existed.

### WhatsApp

One workflow serves every branch's WhatsApp number (a channel add in the
dashboard just points at it — see `SHARED_N8N_WORKFLOWS["whatsapp"]` in
`backend/app/routers/channels.py`, already updated to this workflow's live
ID). Before it can receive real messages:

1. Pick a secret string as the Meta webhook verify token, and replace
   `REPLACE_WITH_YOUR_VERIFY_TOKEN` in both the "Is Verification Request?"
   → wait, in **"Verify Token OK?"** IF node (there's only one occurrence to
   edit) with that string.
2. In Meta App Dashboard → WhatsApp → Configuration → Webhook, register:
   - Callback URL: this workflow's `whatsapp-webhook` production webhook URL
   - Verify token: the same string from step 1
   - Subscribe to the `messages` field
3. Activate the workflow.

Per-message auth to the Graph API is **not** a static n8n credential — the
workflow looks up each channel's own decrypted `access_token` from backend
`GET /channels?identifier=<phone_number_id>` (service-token protected) on
every message, since every branch has its own WhatsApp Business number and
token. Only the calls *to the backend itself* (`Lookup Channel...`,
`Send To Backend Inbound`, `Generate AI Reply`) need the `X-Service-Token`
header described above.

**Media handling (photos + QR booking confirmations):** `Has Image?` (after
the channel lookup, since downloading requires that channel's own
`access_token`) fetches an inbound image via the Graph API's media endpoint
(`GET /{media-id}` for the temporary download URL, then `GET` that URL —
both need the same bearer token) and uploads it to the Supabase Storage
`chat-media` bucket, before `Normalize Media` computes `media_url`/
`media_type` for `/conversations/inbound` and `/chat/reply` — same as
Telegram, this is what lets a symptom photo get analyzed or a payment
receipt get attached over WhatsApp. On the way out, `Has QR Image?` checks
`/chat/reply`'s `image_url`; if present, the QR is fetched, uploaded to
WhatsApp's own media endpoint (`POST /{phone_number_id}/media`, since the
Graph API needs media uploaded there first before it can be referenced by
ID in a message), then sent as a real image message with the AI's reply
text as the caption — never a plain-text link. Replace the
`REPLACE_WITH_SUPABASE_*` placeholders the same way as the Telegram
template before activating a fresh import; the live workflow already has
them filled in.

**Voice notes.** `Has Voice?` mirrors `Has Image?` for `messages[0].audio`:
`Get Voice Media URL` → `Download Voice Media` → `Upload Voice To Storage`
sets `media_type=audio`, the one thing ai-services' `/chat/reply` checks
before it bothers transcribing a voice note via Gemini. Skipping this branch
doesn't fail loudly — the voice note just arrives with no `media_url`, the
AI turn sees an empty message, and the model escalates to a human instead
of replying, which is exactly the silent-bot behavior this branch fixes
(same root cause confirmed live on the Telegram side, see above).

## Live workflow IDs (this n8n instance)

| Workflow | ID |
| --- | --- |
| PLUTO — Appointment Reminders | `CJZliJ5zDTkEA0A4` |
| PLUTO — Waitlist: expire offers | `wlvW4xAg61tQjpnq` |
| PLUTO — Appointments: expire past unconfirmed | `RMEmQkWUe6gW00CH` |
| PLUTO — Queue: close out yesterday | `cZCqMSq3or55ze0v` |
| PLUTO — Packages: expiry reminders + renewal | `EftJSD0pX0aFLldT` |
| PLUTO — Recalls: invitations + escalation | `UMEAJjZhKqyHrmMg` |
| PLUTO — Weekly Report | `ogTBuTVXlJm70ckt` |
| PLUTO — Reclaim Stale Conversations | `8c9rmh1lO59gNSF1` |
| Clinic Telegram Bot (template) | `yPDRT8AQbBKxvENf` — set as `N8N_TELEGRAM_TEMPLATE_WORKFLOW_ID` |
| Clinic Telegram Bot — @mohammed_n8n_helper2_bot (live clone, channel `e7483410-747f-4166-a658-271815e81468`) | `yyd4VGNgwoFYNZM6` |
| PLUTO — WhatsApp Channel Relay | `epezsHMsWNQBJTiL` — already wired into `SHARED_N8N_WORKFLOWS["whatsapp"]` |
