# n8n workflows — reference exports

Source of truth lives in the n8n instance itself; these JSON files are
importable reference exports of what's built there.

All workflows below were also created directly in the live n8n instance via
the n8n MCP server (see "Live workflow IDs"). Importing these JSON files is
only needed to rebuild them on a *different* n8n instance, or to recover
one that got deleted.

## Automated backups

`scripts/backup_n8n_workflows.py`, run daily by
`.github/workflows/n8n-backup.yml` (and on demand via that workflow's
"Run workflow" button), pulls every workflow from the live instance through
n8n's REST API and rewrites this directory to match — so a workflow edited
by hand in n8n's UI never silently drifts out of the repo and gets lost if
the instance is ever wiped or migrated. It also maintains `manifest.json`
(workflow id → filename → active/archived state), which is what keeps
filenames stable across runs instead of re-slugifying names every time.

The script **redacts** any value that looks like a live secret (a
`X-Service-Token`/`Authorization`/`apikey` header, or a handful of known
Code-node variable names) before writing a file, replacing it with a
`<REDACTED-by-backup-script>` placeholder — several nodes on this instance
carry a real token pasted directly into the node instead of an n8n
credential (see "Before activating any of them" below for why), and a
verbatim export would otherwise commit that secret to git history
permanently.

To run it yourself: get an API key from n8n → Settings → n8n API → Create
an API Key, then

```bash
N8N_API_BASE_URL=https://your-n8n-instance.com/api/v1 \
N8N_REST_API_KEY=n8n_api_... \
python3 scripts/backup_n8n_workflows.py
```

For the scheduled GitHub Action to run, set `N8N_API_BASE_URL` and
`N8N_REST_API_KEY` as repository secrets (Settings → Secrets and variables
→ Actions) — it's disabled/no-ops without them, just fails the run.

Two workflows are deliberately excluded from automated backup even though
they exist on the instance — see "⚠️ Two workflows that aren't PLUTO at
all" further down.

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
ID). Inbound messages come in through n8n's **native WhatsApp Trigger node**
(`n8n-nodes-base.whatsAppTrigger`), not a manual Webhook + Meta
verify-handshake IF-chain — n8n handles the GET verification challenge
itself, using the credential, so there's no verify-token string to paste
anywhere. Before it can receive real messages:

1. Create a "WhatsApp OAuth" (`whatsAppTriggerApi`) credential in n8n,
   connected to the clinic's Meta developer app / WhatsApp Business Account.
2. Wire that credential onto this workflow's **"WhatsApp Trigger"** node.
3. Activate the workflow. Activating it is what registers the Meta webhook
   subscription for that app — there's no separate step in the Meta App
   Dashboard.

**This node owns the single Meta webhook subscription for its app.** Meta
allows exactly one active subscriber per WhatsApp app; if any other n8n
workflow is ever activated with a WhatsApp Trigger node on the *same*
credential/app, it silently steals the subscription and real inbound
messages stop reaching this workflow — no error, no active-workflow
warning, just messages going nowhere. This is exactly what happened on
2026-09-15: a stray workflow called "My workflow" (two nodes, WhatsApp
Trigger → Send message, built directly in the n8n UI) got activated on the
same credential and hijacked the subscription for hours before anyone
noticed real WhatsApp messages weren't arriving. The fix was this
workflow's own migration from a manual Webhook node to this native trigger
(so it's the one and only workflow using that credential), plus archiving
"My workflow" (`rCTOmPjJJ7CX0aJq` — still in `manifest.json` as an audit
record, no JSON file). **Never build a second workflow with a WhatsApp
Trigger node on this credential** — if you need to prototype something,
duplicate this whole workflow and swap the credential/webhook path instead.

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

**Incident, 2026-09-15:** `Upload Photo To Storage`/`Upload Voice To
Storage` shipped `disabled: true` with no auth headers at all, but
`Normalize Media` unconditionally built a `chat-media` public URL as if the
upload had happened. Every WhatsApp photo and voice note was silently
failing — ai-services got a `media_url` that 404/400'd on download, logged
`classification_failed`/`transcription_failed` to `audit_log`, and the
patient got a generic "couldn't hear/see that, can you type it instead?"
regardless of what they actually sent. Fixed by enabling both nodes and
adding the `apikey`/`Authorization` headers they were missing (same static-
header pattern as everywhere else on this instance — see "Before activating
any of them"). **If a fresh import of this file still has the photo/voice
branches silently failing, check these two nodes aren't disabled and have
real values in place of `REPLACE_WITH_SUPABASE_SERVICE_ROLE_KEY` first.**

**Voice notes.** `Has Voice?` mirrors `Has Image?` for `messages[0].audio`:
`Get Voice Media URL` → `Download Voice Media` → `Upload Voice To Storage`
sets `media_type=audio`, the one thing ai-services' `/chat/reply` checks
before it bothers transcribing a voice note via Gemini. Skipping this branch
doesn't fail loudly — the voice note just arrives with no `media_url`, the
AI turn sees an empty message, and the model escalates to a human instead
of replying, which is exactly the silent-bot behavior this branch fixes
(same root cause confirmed live on the Telegram side, see above).

## Live workflow IDs (this n8n instance)

The authoritative version of this table is `manifest.json` (id → file →
active/archived state), kept current by the backup script below. This table
is a human-readable summary of the same 14 workflows currently on the
instance.

| Workflow | ID | Status |
| --- | --- | --- |
| PLUTO — Appointment Reminders | `CJZliJ5zDTkEA0A4` | active |
| PLUTO — Waitlist: expire offers | `wlvW4xAg61tQjpnq` | active |
| PLUTO — Appointments: expire past unconfirmed | `RMEmQkWUe6gW00CH` | active |
| PLUTO — Queue: close out yesterday | `cZCqMSq3or55ze0v` | active |
| PLUTO — Packages: expiry reminders + renewal | `EftJSD0pX0aFLldT` | active |
| PLUTO — Recalls: invitations + escalation | `UMEAJjZhKqyHrmMg` | active |
| PLUTO — Weekly Report | `ogTBuTVXlJm70ckt` | active |
| PLUTO — Reclaim Stale Conversations | `8c9rmh1lO59gNSF1` | active |
| Clinic Telegram Bot (template) | `yPDRT8AQbBKxvENf` — set as `N8N_TELEGRAM_TEMPLATE_WORKFLOW_ID` | inactive (template, never activate) |
| Clinic Telegram Bot — @mohammed_n8n_helper2_bot (live clone, channel `e7483410-747f-4166-a658-271815e81468`) | `yyd4VGNgwoFYNZM6` | active |
| PLUTO — WhatsApp Channel Relay | `epezsHMsWNQBJTiL` — already wired into `SHARED_N8N_WORKFLOWS["whatsapp"]` | active |
| My workflow | `rCTOmPjJJ7CX0aJq` | **archived** — caused the WhatsApp hijack bug above, kept only as an audit record |
| Clinica Chatbot - Telegram Bot | `3gRTx27gDGJXtwfV` | inactive, **not part of PLUTO** — see below |
| Clinica Chatbot - Inbound Events (Telegram Delivery) | `4KMyTwNMyGlsXqWA` | active, **not part of PLUTO** — see below |

### ⚠️ Two workflows that aren't PLUTO at all

`Clinica Chatbot - Telegram Bot` and `Clinica Chatbot - Inbound Events
(Telegram Delivery)` talk to a completely different backend
(`clinica.softmedica.net`, a different clinic — "عيادة النور") and were
found on this n8n instance during the 2026-09-15 cleanup. They are **not**
referenced anywhere in this repo, backend, or ai-services. Left alone, they
are actively risky, not just clutter:

- `Clinica Chatbot - Telegram Bot`'s Telegram Trigger node uses the exact
  same bot credential (`@mohammed_n8n_helper2_bot`, id `TXnICQfJs1fSbOZ3`)
  as PLUTO's real `Clinic Telegram Bot — @mohammed_n8n_helper2_bot` channel
  workflow. Telegram allows one webhook per bot token — if this workflow is
  ever activated, it hijacks the PLUTO Telegram channel's inbound messages
  exactly the way "My workflow" hijacked WhatsApp above. It's currently
  **inactive**, which is the only reason there's no live conflict right now.
- Its "الإعدادات" (Settings) Code node has a live Clinica API secret,
  signing key, and Telegram bot token pasted directly in plaintext —
  readable by anyone with access to view/edit this n8n instance's
  workflows.
- Neither workflow is referenced by `manifest.json`'s backup file list on
  purpose — exporting them into this repo would mean committing those live
  secrets to git history, and they don't belong in a PLUTO clinic template
  regardless.

**This needs a decision from whoever owns this n8n instance**, not an
assumption baked into automation: either this is a real second client
("Clinica" / "عيادة النور") that happens to share this n8n server and
Telegram bot — in which case it needs its **own** Telegram bot token to stop
colliding with PLUTO, and its secrets moved out of a plaintext Code node
and into n8n credentials — or it's leftover test/demo content and should be
deleted outright. Until that's decided, leave `3gRTx27gDGJXtwfV` inactive.
