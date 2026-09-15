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

- backend: https://clinic-backend-production-99be.up.railway.app
- ai-services: https://clinic-ai-services-production-7936.up.railway.app

Redeploy after a change: `cd backend && railway up -s clinic-backend -y` (same
pattern for `ai-services`). Env vars are managed with `railway variables
--set KEY=VALUE -s <service>`; a `--set` doesn't restart the running
container by itself — follow it with `railway redeploy -s <service> -y`.

## Setting up a new clinic from scratch

This repo is a **template**: one deployment per clinic. Standing up a new
clinic means creating your own accounts on every service below — nothing
here is shared with any other clinic's deployment. Rough order, since later
steps need values from earlier ones:

### 1. Supabase (database)

1. Create a project at https://supabase.com/dashboard — pick a region close
   to the clinic. Note the **Project URL** and generate a
   **service_role** secret key (Settings → API). Never ship this key to the
   frontend; only `backend`/`ai-services` read it.
2. Apply every migration in `db/migrations/` in order (via the Supabase
   MCP server's `apply_migration`, or `supabase db push` with the CLI, or
   pasting each file into the SQL editor in filename order — `0001_init.sql`
   first). This creates every table, including `pgvector` for message
   embeddings and the `chat-media` Storage bucket used for patient
   photos/voice notes.
3. Confirm the `chat-media` bucket exists and is public-read (patient
   photos/voice notes are fetched by n8n and the vision/transcription
   services by public URL) — `0001_init.sql` creates it, but double-check
   after applying migrations on a brand-new project.

### 2. AI provider keys

- **OpenAI** (`OPENAI_API_KEY`) — required; primary model for chat replies.
- **Gemini** (`GEMINI_API_KEY`) — required in practice, not just "optional
  fallback" as `.env.example` frames it: photo analysis
  (`ai-services/app/services/vision.py`) and voice-note transcription
  (`ai-services/app/services/transcription.py`) call Gemini's
  `generateContent` endpoint directly, with no OpenAI equivalent wired in
  either path. Skipping this key means patients who send a photo or voice
  note get silently treated as if they sent nothing — leave it blank only
  if the clinic will never receive WhatsApp/Telegram photos or voice notes.
  Get a key at https://aistudio.google.com/apikey.

### 3. Railway (or any host that can run two long-lived Python processes)

1. Create two services from this repo, `backend/` and `ai-services/`
   (each has its own `Procfile`/`requirements.txt` — they deploy
   independently). A third service for `frontend/` if you're not hosting
   the dashboard as a static build elsewhere.
2. Set every variable from `.env.example` on both `backend` and
   `ai-services` (they read the same set). Generate real values for
   `JWT_SECRET`, `ENCRYPTION_KEY`, and `SERVICE_TOKEN` per the commands in
   that file — **never reuse another clinic's values**.
3. Once deployed, set `BACKEND_PUBLIC_URL`/`AI_SERVICE_PUBLIC_URL` to the
   real Railway (or custom) domains — n8n and WhatsApp/Telegram need to
   reach these over the public internet, `localhost` never works here.
4. Point the frontend's `VITE_API_BASE_URL` at the backend's public URL and
   deploy/build it.

### 4. n8n (automation — WhatsApp/Telegram delivery + scheduled jobs)

1. Stand up an n8n instance (self-hosted, or n8n Cloud) and create an API
   key (Settings → n8n API) — this is `N8N_REST_API_KEY`/`N8N_API_BASE_URL`
   in `.env.example`, what lets the dashboard provision Telegram channels
   automatically.
2. Import every file in `n8n-workflows/` (Workflows → Import from File).
   Read `n8n-workflows/README.md` first — it documents, per workflow, which
   placeholder values need real credentials before activating, and which
   workflows are templates that should **never** be activated directly
   (`clinic-telegram-bot-template.json`).
3. Create the **"PLUTO Service Token"** credential (or, if this n8n
   instance won't accept a freshly created HTTP custom-auth credential the
   way this template's original instance didn't — see
   `n8n-workflows/README.md`'s "Before activating any of them" — paste
   `SERVICE_TOKEN`'s value directly into each HTTP Request node's
   `X-Service-Token` header instead) and wire it everywhere the workflows
   need it.
4. Activate the 8 scheduled (cron) workflows — see "Scheduled endpoints"
   below for what each one does. Nothing calls these on its own; an
   unwired one is simply work that silently never happens.
5. Set the Telegram template workflow's live n8n ID as
   `N8N_TELEGRAM_TEMPLATE_WORKFLOW_ID` and redeploy backend — this is what
   lets adding a Telegram channel from the dashboard clone + activate a bot
   automatically, with nothing manual per channel afterward.
6. WhatsApp needs one more piece of manual setup — see next section.

### 5. WhatsApp Business setup

WhatsApp is **not** per-branch n8n workflows — one shared workflow
(`whatsapp-channel-relay.json`) serves every branch's WhatsApp number, and
each branch's channel row in the database holds its own encrypted access
token. To wire it up:

1. Create a Meta developer app with the WhatsApp product, and a WhatsApp
   OAuth credential in n8n connected to it (`whatsAppTriggerApi` type).
2. Wire that credential onto the imported workflow's **"WhatsApp Trigger"**
   node and activate the workflow — this registers the Meta webhook
   subscription automatically, no separate dashboard step in Meta.
3. **This credential/app can only ever have one active WhatsApp Trigger
   node subscribed to it, anywhere in this n8n instance.** A second one
   silently steals inbound messages with no error — see the "⚠️" warning
   in `n8n-workflows/README.md` for the incident that taught us this.
4. Add the branch's WhatsApp number as a channel from the dashboard
   (Settings → Channels), pasting in the phone number ID and access token
   from the Meta app — this is what the shared workflow looks up per
   message.

### 6. First run

1. Open the deployed frontend. A fresh database (empty `clinic_settings`)
   shows the first-run setup wizard (`GET /setup/status` →
   `POST /setup/complete`, `frontend/src/pages/SetupWizard.tsx`) — it
   creates the first branch and the first admin account in one step. There
   is no other way to create the first staff login; it's this wizard or a
   manual SQL insert.
2. Log in as that admin, then add branches, staff, services, and
   availability from the dashboard as normal.
3. Add WhatsApp/Telegram channels per branch from Settings → Channels (see
   above) once the n8n side is wired.

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

## API keys & credentials reference

Every one of these lives in `.env.example` with a full explanation of *why*
it's needed inline — this table is the "which service, is it required"
cross-reference. `backend`/`ai-services` both read the same root `.env`.

| Key | Used by | Required? | Where to get it |
| --- | --- | --- | --- |
| `SUPABASE_URL` / `SUPABASE_SERVICE_KEY` | backend, ai-services | **Required** | Supabase dashboard → Settings → API |
| `OPENAI_API_KEY` | ai-services | **Required** | platform.openai.com |
| `GEMINI_API_KEY` | ai-services | **Required in practice** (photo analysis, voice transcription, and the text fallback all depend on it — see "Setting up a new clinic", step 2) | aistudio.google.com/apikey |
| `GEMINI_MODEL` | ai-services | Optional (has a working default) | n/a — a model name, not a secret |
| `N8N_API_BASE_URL` / `N8N_REST_API_KEY` | backend (channel provisioning), `scripts/backup_n8n_workflows.py`, CI backup job | **Required** for automatic Telegram channel provisioning and workflow backups; the app still runs without it, but channel setup becomes fully manual | your n8n instance → Settings → n8n API |
| `N8N_TELEGRAM_TEMPLATE_WORKFLOW_ID` | backend | Required once you want one-click Telegram channels | the live workflow ID after importing/creating `clinic-telegram-bot-template.json` in n8n |
| `BACKEND_PUBLIC_URL` / `AI_SERVICE_PUBLIC_URL` | backend, n8n workflows | **Required** in any real deployment | your Railway/host domains — n8n cannot reach `localhost` |
| `JWT_SECRET` | backend | **Required**, generate fresh per clinic | `python -c "import secrets; print(secrets.token_urlsafe(48))"` |
| `ENCRYPTION_KEY` | backend | **Required**, generate fresh per clinic (encrypts MFA secrets and WhatsApp access tokens at rest) | `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"` |
| `SERVICE_TOKEN` | backend, ai-services, every n8n workflow's HTTP Request nodes | **Required** — this is what n8n authenticates as when it calls the backend/ai-services | `python -c "import secrets; print(secrets.token_urlsafe(32))"` |
| `SERVICE_AUTH_MODE` | backend | Set to `permissive` during initial n8n wiring, `strict` once confirmed working | n/a |
| `CORS_ORIGINS` | backend | **Required** — the dashboard's own URL(s) | n/a |
| `VITE_API_BASE_URL` | frontend | **Required** | the backend's public URL |
| WhatsApp access token (per branch, not an env var) | n8n's shared relay workflow, via `GET /channels` | **Required** for WhatsApp | Meta developer app → WhatsApp → API Setup, pasted into the channel's row in the dashboard (Settings → Channels), encrypted at rest with `ENCRYPTION_KEY` |
| n8n `whatsAppTriggerApi` credential | n8n's WhatsApp Trigger node | **Required** for WhatsApp | Meta developer app OAuth, created directly in n8n |
| Telegram bot token (per channel) | n8n's cloned Telegram workflow | **Required** for Telegram | @BotFather on Telegram, pasted into the credential n8n creates when a channel is added from the dashboard |
| `SUPABASE_PROJECT_REF` / `SUPABASE_ACCESS_TOKEN` / `N8N_MCP_URL` / `N8N_API_KEY` | Claude Code / MCP servers only | Not needed to run the app | only relevant if you use the MCP servers in `.mcp.json` to manage this project with Claude |
