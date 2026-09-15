# PLUTO — system flow plan

A map of how a message/booking/payment actually moves through the system,
end to end. For "how do I set one of these up," see the root `README.md`
and `n8n-workflows/README.md`; this doc is "what happens, in what order,
and why," for onboarding someone into the codebase or debugging a stuck
flow.

## The four moving parts

```
patient (WhatsApp/Telegram)
        │
        ▼
      n8n  ──────────────────────────────────────────────┐
        │  (delivery + media fetch, no business logic)     │ scheduled jobs
        ▼                                                   │ (cron, no patient
   backend/  ── owns the DB, all business rules ──▶ Supabase │  message involved)
        │                                                   │
        ▼                                                   ▼
  ai-services/  (chat replies, photo/voice analysis, embeddings)
        │
        ▼
   backend/ (again — persists the AI's tool calls: booking, payment, etc.)
        │
        ▼
      n8n  ──▶ patient (reply)
```

n8n is deliberately kept dumb: it moves bytes (webhook → HTTP call → HTTP
call → reply), and does zero business-rule decisions. Every rule (can this
slot be booked, is this patient allowed to cancel, does this photo need a
human) lives in `backend/` or `ai-services/`, which is what makes it
possible to reason about the system by reading Python, not by reverse
engineering an n8n canvas.

## 1. Inbound patient message

1. Patient sends a WhatsApp or Telegram message (text, photo, or voice
   note).
2. **n8n** receives it (WhatsApp: native `WhatsApp Trigger` node, one
   shared workflow for every branch's number; Telegram: a
   `Telegram Trigger` node, one cloned workflow per channel — see
   `n8n-workflows/README.md` for why the two differ).
3. If there's a photo or voice note, n8n downloads it from
   WhatsApp/Telegram's own CDN and re-uploads it to the Supabase Storage
   `chat-media` bucket, then computes a public `media_url` +
   `media_type` (`image`/`audio`).
4. n8n calls **backend** `POST /conversations/inbound` with the text (if
   any), `media_url`/`media_type`, and who sent it. Backend:
   - resolves/creates the `conversations` row and matching `patients` row
     (linking by phone/Telegram ID),
   - stores the inbound `messages` row,
   - decides `mode` (`ai` vs a conversation a staff member already claimed
     — the AI never talks over a human), and
   - returns `{conversation_id, mode}`.
5. If `mode == "ai"`, n8n calls **ai-services** `POST /chat/reply` with
   `conversation_id` and the message (`media_url` too, if any).

## 2. ai-services turn: what actually generates a reply

`ai-services/app/routers/chat.py` runs one conversational turn:

1. **Photo?** → `services/vision.py` sends the image to Gemini, which
   classifies it `URGENT` / `ANALYSIS` / `RECEIPT` / `NONE` (see that
   file's module docstring for the exact taxonomy and why "never a real
   diagnosis" is enforced in the prompt itself, not just downstream).
   - `RECEIPT` is routed straight to the payment-receipt tool, never
     treated as a symptom photo.
   - `URGENT`/`ANALYSIS` get folded into this turn's context so the model
     can reference what it saw ("that looks like it could use the
     dermatology package") without ever issuing a diagnosis — the
     booking-assistant system prompt repeats the same never-diagnose rule
     independently, since a prompt only constrains the model it's attached
     to.
2. **Voice note?** → `services/transcription.py` sends the audio to Gemini
   (same provider as vision, deliberately — see that file's docstring: an
   independently-configured OpenAI key already went stale in production
   once and silently broke every voice note, since transcription had no
   fallback the way text replies do). The transcript is treated exactly
   like a typed message from here on. **The bot never replies with audio —
   only text**, regardless of how the patient sent their message.
3. **The LLM turn itself** — OpenAI primary, Gemini fallback on a
   mid-turn failure (rate limit/outage) rather than degrading straight to
   human handoff. Tools available to the model include booking/
   rescheduling/cancelling appointments, checking availability across
   branches, listing services/doctors, submitting a payment receipt, and
   escalating to a human — each tool call is itself a call back into
   **backend**, which re-validates everything (double-booking, branch
   hours, room/staff conflicts, payment state) rather than trusting the
   model's own judgment.
4. Reply text (and, if a booking just confirmed, a QR code image URL) goes
   back to n8n, which sends it to the patient as the actual channel
   message — WhatsApp/Telegram send API, image messages relayed as real
   photos (never a bare link).

## 3. Scheduled jobs (no patient message involved)

Eight n8n Schedule Trigger workflows call a `backend`/`ai-services`
endpoint on a cadence — see the root README's "Scheduled endpoints" table
for the full list (reminders, waitlist/appointment expiry, recalls, weekly
report, reclaiming stuck conversations). None of these have anything to do
with the inbound-message flow above; they're n8n Cron → one HTTP call →
done. All guarded by the same `SERVICE_TOKEN` inbound-webhook auth backend
uses for n8n calls generally.

## 4. Staff/dashboard flow

`frontend/` never talks to Supabase or ai-services directly — only to
`backend`'s REST API, authenticated with a JWT from `POST /auth/login`.
Staff can: manage branches/services/staff/availability, view and reply to
conversations directly (which flips a conversation's `mode` away from
`ai`, so the bot goes quiet on that thread), manage payments/packages, and
configure channels (Settings → Channels — this is what triggers the n8n
Telegram-clone-and-activate flow in `backend/app/core/n8n_client.py`, or
for WhatsApp/Instagram/Messenger/Twilio, just stores a token against the
one shared workflow for that provider type).

## 5. Channel provisioning flow

- **Telegram**: one n8n workflow *cloned per channel* (bot tokens can't
  share a webhook the way Meta's phone-number-scoped WhatsApp tokens can).
  Adding a channel from the dashboard calls n8n's API to clone
  `N8N_TELEGRAM_TEMPLATE_WORKFLOW_ID`, rewrites its channel-ID placeholder
  and per-channel outbound path, swaps in the channel's own bot-token
  credential, and activates it — fully automatic once
  `N8N_TELEGRAM_TEMPLATE_WORKFLOW_ID` is set.
- **WhatsApp**: one shared workflow for every branch (see
  `n8n-workflows/README.md`'s WhatsApp section) — adding a channel just
  stores that branch's phone-number-id/access-token in the database;
  nothing is created in n8n per channel.
- **Instagram / Messenger / Twilio**: `backend/app/routers/channels.py`'s
  `SHARED_N8N_WORKFLOWS` dict already has hardcoded workflow IDs for these
  three provider types (`Mq69unS6cMOOQcv8`, `Jcb1kYGsL24bSbAx`,
  `BUhTP52Fj0o8Qc4m`) — **but none of those workflows exist on the live
  n8n instance** (confirmed 2026-09-15: only 14 workflows total, none of
  them Instagram/Messenger/Twilio). Adding a channel of any of these three
  types from the dashboard will reference a workflow that isn't there.
  This is scaffolding for a feature that was never finished, not a
  regression — flagged here so it doesn't get mistaken for "should already
  work." Building the missing workflows needs real Instagram/Messenger/
  Twilio developer credentials this session didn't have.

## Photo analysis: specialty-scoped, not one-size-fits-all

`ai-services/app/services/vision.py`'s classification prompt used to be
hardcoded to skin/hair/burn conditions only — a leftover from when this
template's only real deployment looked like a dermatology/cosmetics
clinic. PLUTO turned out to be a genuine multi-specialty clinic (dentistry,
internal medicine/cardiology, dermatology/cosmetics, ENT/orthopedics,
OB/pediatrics — see the `specialties` table), so a photo of, say, a
swollen gum or joint was getting no useful read at all, and a photo of
something no specialty here covers (an eye problem, with no ophthalmology
offered) had no way to say so.

Fixed by building the prompt fresh on every call from the clinic's own
active `specialties` (`chat.py`'s `_active_specialty_names(db)` →
`vision.py`'s `_build_vision_prompt`), and adding a fifth classification,
`out_of_scope`: a visible concern that plausibly falls outside every
specialty this clinic actually offers gets an honest "that's not something
we treat here" reply (own prompt branch in `_build_system_prompt`, own
tool exclusion, own escalation suppression — mirroring how `analysis`
already works) instead of a mismatched service card or silence. Falls back
to the old unscoped behavior when no specialties are configured, so a
newly-deployed clinic that hasn't set up its specialty list yet still gets
photos analyzed, just without the out-of-scope distinction.

**For a future clinic with a different specialty list**: nothing to
configure — this is fully data-driven from `specialties.name_ar`/
`is_active`. Keep that table accurate and the vision prompt follows it
automatically.

## Known gaps / things to verify next time this area is touched

- **Instagram/Messenger/Twilio channels are unfinished** — see above.
  Either build the three missing n8n workflows (mirroring the WhatsApp
  relay's shared-workflow pattern) before offering these provider types in
  the dashboard, or hide them from the channel-type picker until they are.
- **Two unrelated "Clinica" workflows share PLUTO's Telegram bot
  credential** — see the ⚠️ section in `n8n-workflows/README.md`. Confirmed
  with the clinic owner (2026-09-15): known, deliberately left alone for
  now — do not touch, delete, or modify either workflow.
