# n8n workflows — reference exports

Source of truth lives in the n8n instance itself; these JSON files are
importable reference exports of the 8 scheduled workflows described in the
root `README.md`'s "Scheduled endpoints" table. Re-export and commit here
after any change made directly in n8n's UI, so this directory stays in sync.

## Import

In n8n: **Workflows → Import from File**, pick one of the JSON files here.

Each workflow is a `Schedule Trigger` → one or more `HTTP Request` nodes,
with `timezone: Asia/Amman` set explicitly on the workflow (a cron
expression alone fires in the n8n instance's own timezone, not the
clinic's).

## Before activating any of them

1. Create an **HTTP Header Auth** credential named `PLUTO Service Token` in
   n8n, with header name `X-Service-Token` and the value matching the
   backend/ai-services `SERVICE_TOKEN` env var.
2. Each imported workflow references that credential by name but not by ID
   (`REPLACE_WITH_PLUTO_SERVICE_TOKEN_CREDENTIAL_ID` placeholder) — after
   import, open each `HTTP Request` node and re-select the credential from
   the dropdown so n8n binds it to the real credential ID in your instance.
3. Activate the workflow.

## Workflows

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

All times are Asia/Amman. Cadences for reminders/reclaim-stale/report time
were not pinned down by an existing SLA — adjust the `Schedule Trigger`
node on import if the clinic needs a different frequency.

## Not included here

`imports/sheets-sync/process-due` is a scheduled backend endpoint (see the
root README's table) but wasn't part of the named workflow list — no
reference export exists for it yet. Wire it the same way (`Schedule
Trigger` → `HTTP Request` → backend `/imports/sheets-sync/process-due`) if
Google Sheets imports are in use.
