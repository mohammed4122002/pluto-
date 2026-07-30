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
