# Clinic Platform

Single-clinic template (one deployment per clinic, multiple branches within it).

## Architecture — three independent layers

```
frontend/     React (Vite + TS) — UI only, talks exclusively to backend/
backend/      FastAPI — business logic, database access, REST API
ai-services/  FastAPI — independent AI microservice (chat replies, intent
              classification, embeddings), called by backend/ or n8n
n8n-workflows/  reference exports of the automation workflows (source of
                truth lives in n8n itself, managed via MCP)
db/migrations/  SQL migrations, applied via the Supabase MCP server
```

Rules that keep this from tangling as it grows:

- **frontend never talks to Supabase or ai-services directly** — only to
  `backend`'s REST API (`frontend/src/api/client.ts`). This is what lets the
  frontend and backend teams (or AI stack) move independently.
- **backend owns the database.** It holds the `service_role` key
  (`SUPABASE_SERVICE_KEY`, never shipped to the frontend). All business rules
  and validation live here.
- **ai-services is swappable.** It's a separate FastAPI process with its own
  `requirements.txt` — the model/provider behind it can change without
  touching `backend` or `frontend`, as long as its API contract holds.

## Data model

Single clinic → many `branches` → staff, services, availability, and
appointments are scoped per branch. Multi-branch, not multi-tenant: this repo
is deployed once per clinic, not shared across clinics.

`channels` / `conversations` / `messages` hold the link between the dashboard
and communication channels (e.g. WhatsApp via n8n) — a channel is configured
per branch, conversations happen against a channel, and messages carry an
optional `pgvector` embedding for semantic search.

See `db/migrations/0001_init.sql` for the full schema.

See `docs/known-issues.md` before debugging a "Network Error" seen only in
local development — it's likely a documented Windows-only dev-environment
quirk, not a code regression.

## Running locally

```bash
# backend
cd backend && pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

# ai-services
cd ai-services && pip install -r requirements.txt
uvicorn app.main:app --reload --port 8100

# frontend
cd frontend && npm install
npm run dev
```

Copy `.env.example` to `.env` at the repo root and fill in real values —
`backend/` and `ai-services/` both read it (`SUPABASE_URL`,
`SUPABASE_SERVICE_KEY`, `OPENAI_API_KEY`). `frontend/.env.example` only
needs `VITE_API_BASE_URL`.

## Production deployment

`backend` and `ai-services` are deployed on Railway (each its own project, a
`Procfile` in each directory tells Railway how to run it). n8n is hosted
separately (Hostinger) and calls these over the public internet — it can't
reach `localhost`, which is why a real deployment exists at all.

- backend: https://clinic-backend-production-4ead.up.railway.app
- ai-services: https://clinic-ai-services-production.up.railway.app

Redeploy after a change: `cd backend && railway up -s clinic-backend -y` (same
pattern for `ai-services`). Env vars are managed with `railway variables
--set KEY=VALUE -s <service>`; a `--set` doesn't restart the running
container by itself — follow it with `railway redeploy -s <service> -y`.

## Scheduled endpoints

These endpoints do work that nothing else triggers. Each one is guarded by
`SERVICE_TOKEN` (send it as the service auth header) and is meant to be called
on a schedule from n8n Cron — the backend runs no scheduler of its own, so an
endpoint that is never wired is simply work that never happens.

| Endpoint | Cadence | What it does |
| --- | --- | --- |
| `POST /notifications/process-due` | every few minutes | sends reminders whose send time has arrived |
| `POST /conversations/inbound` | per message | not a cron — the channel webhook target |
| `POST /appointments/process-expired` | hourly | closes appointments whose time passed while still unconfirmed |
| `POST /waitlist/process-expired` | hourly | expires waitlist offers past their deadline and falls through to the next candidate |
| `POST /queues/process-stale` | nightly | closes out tickets left open on a queue whose day has ended |
| `POST /patient-packages/process-expiring` | daily | flags packages approaching their expiry |
| `POST /recalls/process-due` | daily | sends recalls that have come due |
| `POST /imports/sheets-sync/process-due` | as configured | runs due Google Sheets syncs |

All of these are wired in n8n. Each one is a Schedule Trigger into a single
HTTP Request node carrying the "PLUTO Service Token" header credential, with a
sticky note on the canvas explaining what breaks without it. The workflows set
`timezone: Asia/Amman` explicitly — a cron expression alone would fire in the
n8n instance's own timezone, which is not the clinic's.

| Workflow | Endpoint |
| --- | --- |
| PLUTO — Appointment Reminders | `/notifications/process-due` |
| PLUTO — Waitlist: expire offers | `/waitlist/process-expired` |
| PLUTO — Appointments: expire past unconfirmed | `/appointments/process-expired` |
| PLUTO — Queue: close out yesterday | `/queues/process-stale` |
| PLUTO — Packages: expiry reminders + renewal | `/patient-packages/process-expiring` |
| PLUTO — Recalls: invitations + escalation | recalls endpoints |
| PLUTO — Weekly Report | `/reports/send-weekly` |
| PLUTO — Reclaim Stale Conversations | ai-services `/chat/reclaim-stale` |
