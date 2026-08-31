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

1. Create an **HTTP Custom Auth (Templated)** credential in n8n named
   `PLUTO Service Token`. In the credential's template, set:
   `{"headers": {"X-Service-Token": "<the value>"}}`, where `<the value>`
   matches the backend/ai-services `SERVICE_TOKEN` env var. (n8n rejects a
   *new* plain HTTP Header Auth credential on the HTTP Request node — the
   templated type is the one it accepts for new credentials; the header it
   sends is identical either way.)
2. Each imported workflow references that credential by name but not by ID
   (`REPLACE_WITH_PLUTO_SERVICE_TOKEN_CREDENTIAL_ID` placeholder) — after
   import, open each `HTTP Request` node and re-select the credential from
   the dropdown so n8n binds it to the real credential ID in your instance.
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
`Send To Backend Inbound`, `Generate AI Reply`) need the `PLUTO Service
Token` credential wired in.

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
| PLUTO — WhatsApp Channel Relay | `epezsHMsWNQBJTiL` — already wired into `SHARED_N8N_WORKFLOWS["whatsapp"]` |
