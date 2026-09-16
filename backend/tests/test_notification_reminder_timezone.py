"""send_notification_for_appointment must render {{time}}/{{date}} in the
appointment's own branch timezone, not the raw UTC scheduled_at Postgres
returns.

Confirmed live 2026-09-16: a 15:00 Asia/Amman (UTC+3) appointment's reminder
read "12:00" -- the raw UTC wall-clock time with no conversion at all, 3
hours off. Every other place in this codebase that displays an appointment
time (slot computation in app/services/slots.py, the booking confirmation
text ai-services sends) already converts via the branch's own `timezone`
column first; this was the one spot that had been missed.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.notifications import send_notification_for_appointment  # noqa: E402
from tests.fake_supabase import FakeSupabase  # noqa: E402

APPT = "appt-1"
PATIENT = "patient-1"
BRANCH = "branch-1"
CHANNEL = "channel-1"


def _db(scheduled_at_utc: str, branch_timezone: str = "Asia/Amman") -> FakeSupabase:
    return FakeSupabase(
        {
            "appointments": [
                {
                    "id": APPT,
                    "patient_id": PATIENT,
                    "scheduled_at": scheduled_at_utc,
                    "appointment_number": "APT-TEST-1",
                    "confirmation_code": "ABC123",
                    "patients": {"full_name": "Test Patient", "phone": "+962700000000"},
                    "staff": {"full_name": "Dr. Test"},
                    "branches": {"name": "Test Branch", "timezone": branch_timezone},
                }
            ],
            "conversations": [
                {
                    "patient_id": PATIENT,
                    "created_at": "2026-01-01T00:00:00+00:00",
                    "channels": {
                        "id": CHANNEL,
                        "identifier": "962700000000",
                        "outbound_webhook_url": "https://example.test/outbound",
                        "channel_type": "whatsapp",
                    },
                }
            ],
            "notification_log": [],
        }
    )


def _schedule_and_template() -> tuple[dict, dict]:
    schedule = {"id": "sched-1"}
    template = {
        "id": "tmpl-1",
        "channel_type": "whatsapp",
        "body_template": "تذكير: موعدك الساعة {{time}} بتاريخ {{date}}",
    }
    return schedule, template


def test_reminder_time_is_converted_from_utc_to_the_branch_timezone(monkeypatch):
    # 12:00 UTC on a UTC+3 branch is 15:00 local -- the exact incident.
    db = _db("2026-09-16T12:00:00+00:00")
    schedule, template = _schedule_and_template()

    sent = {}

    def fake_post(url, json, timeout):
        sent["json"] = json
        from types import SimpleNamespace

        return SimpleNamespace(status_code=200)

    monkeypatch.setattr("app.services.notifications.httpx.post", fake_post)

    send_notification_for_appointment(db, APPT, schedule, template)

    assert "15:00" in sent["json"]["message"]
    assert "12:00" not in sent["json"]["message"]
    assert db._tables["notification_log"][0]["status"] == "sent"


def test_a_different_branch_timezone_is_respected_too(monkeypatch):
    # America/New_York is UTC-4 in September (daylight saving): 12:00 UTC ->
    # 08:00 local. Deliberately a real IANA zone via ZoneInfo, not a fixed
    # offset, so DST is handled correctly too.
    db = _db("2026-09-16T12:00:00+00:00", branch_timezone="America/New_York")
    schedule, template = _schedule_and_template()
    sent = {}

    def fake_post(url, json, timeout):
        sent["json"] = json
        from types import SimpleNamespace

        return SimpleNamespace(status_code=200)

    monkeypatch.setattr("app.services.notifications.httpx.post", fake_post)

    send_notification_for_appointment(db, APPT, schedule, template)

    assert "08:00" in sent["json"]["message"]


def test_missing_branch_timezone_falls_back_to_asia_amman(monkeypatch):
    db = _db("2026-09-16T12:00:00+00:00", branch_timezone="")
    db._tables["appointments"][0]["branches"]["timezone"] = None
    schedule, template = _schedule_and_template()
    sent = {}

    def fake_post(url, json, timeout):
        sent["json"] = json
        from types import SimpleNamespace

        return SimpleNamespace(status_code=200)

    monkeypatch.setattr("app.services.notifications.httpx.post", fake_post)

    send_notification_for_appointment(db, APPT, schedule, template)

    assert "15:00" in sent["json"]["message"]
