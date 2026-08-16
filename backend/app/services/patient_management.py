import re
from datetime import date, datetime, timezone
from difflib import SequenceMatcher

from fastapi import HTTPException
from supabase import Client

_PHONE_STRIP_RE = re.compile(r"[^\d]")
MATCH_THRESHOLD = 55.0

_MERGE_TABLES = [
    ("appointments", "patient_id"),
    ("conversations", "patient_id"),
    ("payments", "patient_id"),
    ("waitlist", "patient_id"),
    ("patient_packages", "patient_id"),
    # invoices.patient_id is set once at issue_invoice() time from the
    # appointment's patient, not derived from appointments at read time — so
    # without this a merged invoice kept pointing at the tombstoned loser
    # even though its own appointment had just been repointed to the
    # survivor above (confirmed live: after merging two QA patients, the
    # appointment's patient_id followed the merge but the invoice's didn't).
    ("invoices", "patient_id"),
    # patient_channel_identities.patient_id is what handle_inbound_message
    # actually reads to resolve a returning WhatsApp/Telegram sender to a
    # patient (app/routers/conversations.py) — without repointing it here,
    # the very next message from someone whose duplicate record just got
    # merged away would resolve straight back to the tombstoned loser
    # (is_merged_into set, but nothing routes future messages around it),
    # silently undoing the merge for that channel on their first reply.
    ("patient_channel_identities", "patient_id"),
    # notification_log is keyed by appointment_id only — it follows the
    # patient automatically once appointments.patient_id is repointed above.
]
# Composite-PK join tables need collision-aware merging instead of a plain update.
_MERGE_JOIN_TABLES = [("patient_guardians", "guardian_id"), ("patient_tags", "tag")]


def _normalize_phone(phone: str | None) -> str:
    return _PHONE_STRIP_RE.sub("", phone or "")


def _normalize_name(name: str | None) -> str:
    return " ".join((name or "").strip().lower().split())


def _compute_match(a: dict, b: dict) -> tuple[float, list[str]]:
    reasons: list[str] = []
    score = 0.0

    if a.get("phone") and b.get("phone") and _normalize_phone(a["phone"]) == _normalize_phone(b["phone"]):
        score = max(score, 95.0)
        reasons.append("same_phone")

    name_ratio = SequenceMatcher(None, _normalize_name(a.get("full_name")), _normalize_name(b.get("full_name"))).ratio()
    if name_ratio >= 0.85:
        name_score = 55 + (name_ratio - 0.85) * 200  # 0.85 -> 55, 1.0 -> 85
        same_dob = bool(a.get("date_of_birth")) and a.get("date_of_birth") == b.get("date_of_birth")
        if same_dob:
            name_score += 10
            reasons.append("same_name_and_dob")
        else:
            reasons.append("similar_name")
        score = max(score, min(name_score, 99.0))

    return round(score, 1), reasons


def is_minor(dob: date | None) -> bool:
    if not dob:
        return False
    today = date.today()
    age = today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))
    return age < 18


def find_duplicates_for(db: Client, new_patient: dict) -> list[dict]:
    """Scans existing (non-merged) patients for likely duplicates of a
    freshly created patient, persists any match as a pending
    patient_duplicates row, and returns them so the caller can alert
    immediately (FR-PAT: automatic duplicate detection on creation)."""
    candidates = (
        db.table("patients")
        .select("id, full_name, phone, date_of_birth")
        .is_("is_merged_into", "null")
        .neq("id", new_patient["id"])
        .execute()
        .data
    )
    created = []
    for candidate in candidates:
        score, reasons = _compute_match(new_patient, candidate)
        if score < MATCH_THRESHOLD:
            continue
        row = (
            db.table("patient_duplicates")
            .insert(
                {
                    "patient_a_id": new_patient["id"],
                    "patient_b_id": candidate["id"],
                    "match_score": score,
                    "match_reasons": reasons,
                }
            )
            .execute()
            .data[0]
        )
        row["patient_a_name"] = new_patient["full_name"]
        row["patient_a_phone"] = new_patient["phone"]
        row["patient_b_name"] = candidate["full_name"]
        row["patient_b_phone"] = candidate["phone"]
        created.append(row)
    return created


def merge_patients(db: Client, duplicate_id: str, survivor_id: str, staff_id: str) -> dict:
    dup_rows = db.table("patient_duplicates").select("*").eq("id", duplicate_id).limit(1).execute().data
    if not dup_rows:
        raise HTTPException(status_code=404, detail="لم يتم العثور على هذا الزوج من السجلات")
    dup = dup_rows[0]
    if survivor_id not in (dup["patient_a_id"], dup["patient_b_id"]):
        raise HTTPException(status_code=400, detail="survivor_id يجب أن يكون أحد المريضين بهذا الزوج")
    loser_id = dup["patient_b_id"] if survivor_id == dup["patient_a_id"] else dup["patient_a_id"]

    loser = db.table("patients").select("*").eq("id", loser_id).limit(1).execute().data[0]

    for table, column in _MERGE_TABLES:
        db.table(table).update({"patient_id": survivor_id}).eq(column, loser_id).execute()

    for table, key_column in _MERGE_JOIN_TABLES:
        existing_keys = {r[key_column] for r in db.table(table).select(key_column).eq("patient_id", survivor_id).execute().data}
        for row in db.table(table).select("*").eq("patient_id", loser_id).execute().data:
            if row[key_column] in existing_keys:
                db.table(table).delete().eq("patient_id", loser_id).eq(key_column, row[key_column]).execute()
            else:
                db.table(table).update({"patient_id": survivor_id}).eq("patient_id", loser_id).eq(key_column, row[key_column]).execute()

    db.table("patients").update({"is_merged_into": survivor_id}).eq("id", loser_id).execute()
    db.table("patient_duplicates").update(
        {"status": "confirmed_duplicate", "reviewed_by": staff_id, "reviewed_at": datetime.now(timezone.utc).isoformat()}
    ).eq("id", duplicate_id).execute()

    db.table("audit_log").insert(
        {
            "entity_type": "patient",
            "entity_id": loser_id,
            "action": "merge",
            "old_value": {"loser": loser},
            "new_value": {"merged_into": survivor_id},
            "user_id": staff_id,
            "reason": f"دمج سجلات مكررة (نسبة تطابق {dup['match_score']})",
        }
    ).execute()

    return db.table("patients").select("*").eq("id", survivor_id).limit(1).execute().data[0]


def dismiss_duplicate(db: Client, duplicate_id: str, staff_id: str) -> dict:
    rows = (
        db.table("patient_duplicates")
        .update({"status": "not_duplicate", "reviewed_by": staff_id, "reviewed_at": datetime.now(timezone.utc).isoformat()})
        .eq("id", duplicate_id)
        .execute()
        .data
    )
    if not rows:
        raise HTTPException(status_code=404, detail="لم يتم العثور على هذا الزوج من السجلات")
    return rows[0]


def delete_patient_permanently(db: Client, patient_id: str, staff_id: str) -> None:
    """Permanently erases a patient and every conversation ever had with
    them. Built for QA: retesting a chat-bot scenario needs the *next*
    message from that same phone/Telegram account to look genuinely
    first-contact, not resume an existing conversation with months of
    history, an already-saved contact record, or a spent OTP. A soft delete
    (deleted_at, used elsewhere in this router) can't give that —
    _load_conversation and resolve_identity would still find the old
    conversation/identity and the AI would still see the old message
    history and turn count.

    Everything else already cascades from patients via existing foreign
    keys (appointments, payments, invoices, patient_packages, waitlist,
    patient_guardians, patient_tags, patient_duplicates, recalls).
    conversations.patient_id does not (no ON DELETE clause — a plain
    patients delete would fail outright with an FK violation without this),
    so it's cleared explicitly first; messages/chat_booking_otp then cascade
    from conversations the normal way. patient_channel_identities.patient_id
    is ON DELETE SET NULL by design elsewhere (keeps a record of who
    messaged even after their patient record is gone) — deleted explicitly
    here too, since this is a full reset: a leftover identity row would
    otherwise carry over its old first_seen_at/display_name to whatever new
    patient record that same channel account creates next.
    """
    rows = db.table("patients").select("id, full_name, phone").eq("id", patient_id).limit(1).execute().data
    if not rows:
        raise HTTPException(status_code=404, detail="المريض غير موجود")
    patient = rows[0]

    db.table("conversations").delete().eq("patient_id", patient_id).execute()
    db.table("patient_channel_identities").delete().eq("patient_id", patient_id).execute()

    db.table("audit_log").insert(
        {
            "entity_type": "patient",
            "entity_id": patient_id,
            "action": "delete",
            "old_value": patient,
            "user_id": staff_id,
            "reason": "حذف نهائي للمريض وكل محادثاته",
        }
    ).execute()

    db.table("patients").delete().eq("id", patient_id).execute()
