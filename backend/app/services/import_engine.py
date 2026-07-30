"""The generic import pipeline: one pass over source rows that either only
*computes* what would happen (dry run, zero writes) or actually applies it
(execute), driven by the exact same matching logic so the preview a staff
member approved is guaranteed to be what actually happens."""

from datetime import datetime, timedelta, timezone

from supabase import Client

from app.services.import_fields import DAY_NAME_TO_INDEX, DEFAULT_MATCH_KEY, FIELD_DEFINITIONS, STATUS_MAP
from app.services.import_values import AmbiguousDateError, looks_like_hijri_year, normalize_digits, parse_date_or_datetime

UNDO_WINDOW_DAYS = 7


def apply_mapping(raw_row: dict, column_mapping: dict[str, str | None]) -> dict:
    """source-column -> target-field, using the confirmed mapping."""
    mapped: dict = {}
    for source_col, target_field in column_mapping.items():
        if not target_field:
            continue
        value = raw_row.get(source_col)
        if value is None:
            continue
        if isinstance(value, str):
            value = normalize_digits(value.strip())
            if value == "":
                continue
        mapped[target_field] = value
    return mapped


def scan_for_date_prompts(rows: list[dict], column_mapping: dict[str, str | None], data_type: str, options: dict) -> dict | None:
    """Looks for one ambiguous date (03/05/2026-style) or one plausibly-Hijri
    year anywhere in the file — returns a prompt for the frontend to ask a
    single yes/no question rather than silently guessing per row."""
    if options.get("day_first") is not None and options.get("assume_hijri") is not None:
        return None

    date_fields = {f for f, d in FIELD_DEFINITIONS[data_type].items() if d["kind"] in ("date", "datetime")}
    if not date_fields:
        return None

    for raw_row in rows:
        mapped = apply_mapping(raw_row, column_mapping)
        for field in date_fields:
            if field not in mapped:
                continue
            _, ambiguous, hijri = parse_date_or_datetime(mapped[field], options.get("day_first"), bool(options.get("assume_hijri")))
            if ambiguous and options.get("day_first") is None:
                return {"type": "ambiguous_date", "field": field, "sample": str(mapped[field])}
            if hijri and options.get("assume_hijri") is None:
                return {"type": "possible_hijri", "field": field, "sample": str(mapped[field])}
    return None


def _parse_date_field(mapped: dict, field: str, options: dict):
    if field not in mapped:
        return None
    parsed, ambiguous, _ = parse_date_or_datetime(mapped[field], options.get("day_first"), bool(options.get("assume_hijri")))
    if ambiguous:
        raise AmbiguousDateError(str(mapped[field]))
    return parsed


def _build_patient_payload(mapped: dict, options: dict) -> tuple[dict | None, str | None]:
    full_name, phone = mapped.get("full_name"), mapped.get("phone")
    if not phone or not full_name:
        return None, "بدون اسم أو رقم هاتف"
    payload: dict = {"full_name": full_name, "phone": phone}
    for f in ("email", "gender", "notes"):
        if mapped.get(f):
            payload[f] = mapped[f]
    dob = _parse_date_field(mapped, "date_of_birth", options)
    if dob:
        payload["date_of_birth"] = dob.isoformat() if hasattr(dob, "isoformat") else str(dob)
    return payload, None


def _build_service_payload(mapped: dict, options: dict) -> tuple[dict | None, str | None]:
    name = mapped.get("name")
    if not name:
        return None, "بدون اسم خدمة"
    payload: dict = {"name": name}
    if mapped.get("description"):
        payload["description"] = mapped["description"]
    if mapped.get("duration_minutes"):
        try:
            payload["duration_minutes"] = int(float(mapped["duration_minutes"]))
        except (ValueError, TypeError):
            return None, f"مدة غير صالحة: {mapped['duration_minutes']}"
    if mapped.get("price"):
        try:
            payload["price"] = float(mapped["price"])
        except (ValueError, TypeError):
            return None, f"سعر غير صالح: {mapped['price']}"
    return payload, None


def _build_staff_payload(mapped: dict, options: dict, row_number: int) -> tuple[dict | None, str | None, dict]:
    name = mapped.get("full_name")
    if not name:
        return None, "بدون اسم", {}
    raw_role = (mapped.get("role") or "").strip()
    if "استقبال" in raw_role or "reception" in raw_role.lower():
        role, specialty = "receptionist", None
    elif "مدير" in raw_role or "admin" in raw_role.lower():
        role, specialty = "admin", None
    else:
        role, specialty = "doctor", raw_role or None

    email = mapped.get("email") or f"{str(name).replace(' ', '.').lower()}.{row_number}@imported.local"
    payload = {"full_name": name, "email": email, "role": role}
    if mapped.get("phone"):
        payload["phone"] = mapped["phone"]
    if specialty:
        payload["specialty"] = specialty
    if mapped.get("active"):
        payload["is_active"] = str(mapped["active"]).strip().upper() in {"TRUE", "1", "YES", "نعم"}

    availability = {}
    if mapped.get("work_start") and mapped.get("work_end") and mapped.get("working_days"):
        availability = {
            "work_start": str(mapped["work_start"]),
            "work_end": str(mapped["work_end"]),
            "working_days": [d.strip().lower() for d in str(mapped["working_days"]).split(",")],
        }
    return payload, None, availability


def _apply_staff_availability(db: Client, staff_id: str, branch_id: str, availability: dict) -> None:
    db.table("doctor_availability").delete().eq("staff_id", staff_id).eq("branch_id", branch_id).execute()
    for day_name in availability["working_days"]:
        day_index = DAY_NAME_TO_INDEX.get(day_name)
        if day_index is None:
            continue
        db.table("doctor_availability").insert(
            {
                "staff_id": staff_id,
                "branch_id": branch_id,
                "day_of_week": day_index,
                "start_time": availability["work_start"],
                "end_time": availability["work_end"],
            }
        ).execute()


def process_rows(
    db: Client,
    data_type: str,
    branch_id: str | None,
    rows: list[dict],
    column_mapping: dict[str, str | None],
    options: dict,
    dry_run: bool,
    job_id: str | None,
) -> list[dict]:
    """Single pass, used by both the preview and the real execution. When
    dry_run is False, actually writes and tags created_by_import_job_id."""
    on_existing = options.get("on_existing", "update")  # update | skip | abort
    match_key = options.get("match_key") or DEFAULT_MATCH_KEY[data_type]

    existing_by_key: dict = {}
    if data_type in ("patients", "services", "staff"):
        table = data_type
        select_cols = f"id, {match_key}"
        existing_rows = db.table(table).select(select_cols).is_("deleted_at", "null").execute().data
        for row in existing_rows:
            key_val = row.get(match_key)
            if key_val:
                existing_by_key[str(key_val).strip().lower() if isinstance(key_val, str) else key_val] = row["id"]

    existing_appt_keys: dict = {}
    patients_by_phone: dict = {}
    if data_type == "appointments":
        for p in db.table("patients").select("id, phone").is_("deleted_at", "null").execute().data:
            patients_by_phone[p["phone"]] = p["id"]
        if branch_id:
            for a in (
                db.table("appointments")
                .select("id, patient_id, scheduled_at")
                .eq("branch_id", branch_id)
                .is_("deleted_at", "null")
                .execute()
                .data
            ):
                existing_appt_keys[(a["patient_id"], a["scheduled_at"])] = a["id"]

    results: list[dict] = []

    for i, raw_row in enumerate(rows):
        row_number = i + 2  # spreadsheet-style: row 1 is the header
        mapped = apply_mapping(raw_row, column_mapping)
        result = {"row_number": row_number, "raw_data": raw_row, "action": "error", "reason": None, "entity_id": None, "previous_values": None}

        try:
            if data_type == "patients":
                payload, err = _build_patient_payload(mapped, options)
                if err:
                    result["reason"] = err
                    results.append(result)
                    continue
                key_val = payload["phone"] if match_key == "phone" else str(payload.get(match_key, "")).strip().lower()
                existing_id = existing_by_key.get(key_val)
                result.update(_apply_upsert(db, "patients", payload, existing_id, on_existing, dry_run, job_id))

            elif data_type == "services":
                payload, err = _build_service_payload(mapped, options)
                if err:
                    result["reason"] = err
                    results.append(result)
                    continue
                key_val = str(payload["name"]).strip().lower()
                existing_id = existing_by_key.get(key_val)
                result.update(_apply_upsert(db, "services", payload, existing_id, on_existing, dry_run, job_id))

            elif data_type == "staff":
                payload, err, availability = _build_staff_payload(mapped, options, row_number)
                if err:
                    result["reason"] = err
                    results.append(result)
                    continue
                key_val = payload.get(match_key)
                key_val = key_val.strip().lower() if isinstance(key_val, str) else key_val
                existing_id = existing_by_key.get(key_val) if key_val else None
                sub_result = _apply_upsert(db, "staff", payload, existing_id, on_existing, dry_run, job_id)
                result.update(sub_result)
                if not dry_run and result["action"] in ("create", "update") and availability and branch_id:
                    _apply_staff_availability(db, result["entity_id"], branch_id, availability)
                if not dry_run and result["action"] == "create" and branch_id:
                    db.table("staff_branches").upsert(
                        {"staff_id": result["entity_id"], "branch_id": branch_id}, on_conflict="staff_id,branch_id"
                    ).execute()

            elif data_type == "appointments":
                phone = mapped.get("patient_phone")
                when = _parse_date_field(mapped, "appointment_time", options)
                if not phone or not when:
                    result["reason"] = "بدون رقم هاتف أو موعد صالح"
                    results.append(result)
                    continue
                scheduled_iso = when.isoformat() if hasattr(when, "isoformat") else str(when)
                patient_id = patients_by_phone.get(phone)
                existing_id = existing_appt_keys.get((patient_id, scheduled_iso)) if patient_id else None

                payload = {
                    "branch_id": branch_id,
                    "scheduled_at": scheduled_iso,
                    "status": STATUS_MAP.get(str(mapped.get("status", "")).strip().lower(), "requested"),
                    "source": "import",
                }
                if mapped.get("notes"):
                    payload["notes"] = mapped["notes"]
                if mapped.get("duration_minutes"):
                    try:
                        payload["duration_minutes"] = int(float(mapped["duration_minutes"]))
                    except (ValueError, TypeError):
                        pass

                if existing_id and on_existing == "abort":
                    result["reason"] = "موعد مطابق موجود مسبقاً لنفس المريض بنفس الوقت"
                    results.append(result)
                    continue
                if existing_id and on_existing == "skip":
                    result.update({"action": "skip", "reason": "موعد مطابق موجود مسبقاً", "entity_id": existing_id})
                    results.append(result)
                    continue

                if dry_run:
                    if existing_id:
                        result.update({"action": "update", "entity_id": existing_id})
                    else:
                        result.update({"action": "create", "entity_id": None})
                else:
                    if not patient_id:
                        patient_id = db.table("patients").insert(
                            {"full_name": mapped.get("patient_name") or phone, "phone": phone}
                        ).execute().data[0]["id"]
                        patients_by_phone[phone] = patient_id
                    payload["patient_id"] = patient_id
                    if existing_id:
                        previous = db.table("appointments").select("*").eq("id", existing_id).limit(1).execute().data
                        db.table("appointments").update(payload).eq("id", existing_id).execute()
                        result.update({"action": "update", "entity_id": existing_id, "previous_values": previous[0] if previous else None})
                    else:
                        payload["created_by_import_job_id"] = job_id
                        created = db.table("appointments").insert(payload).execute().data[0]
                        result.update({"action": "create", "entity_id": created["id"]})

        except AmbiguousDateError as exc:
            result["reason"] = f"تاريخ غامض: {exc.raw}"
        except Exception as exc:  # noqa: BLE001 — one bad row must never abort the whole import
            result["reason"] = f"خطأ غير متوقع: {exc}"

        results.append(result)

    return results


def _apply_upsert(db: Client, table: str, payload: dict, existing_id: str | None, on_existing: str, dry_run: bool, job_id: str | None) -> dict:
    if existing_id:
        if on_existing == "abort":
            return {"action": "error", "reason": "سجل مطابق موجود مسبقاً (وضع الإيقاف عند التكرار)"}
        if on_existing == "skip":
            return {"action": "skip", "reason": "سجل مطابق موجود مسبقاً", "entity_id": existing_id}
        if dry_run:
            return {"action": "update", "entity_id": existing_id}
        previous = db.table(table).select("*").eq("id", existing_id).limit(1).execute().data
        db.table(table).update(payload).eq("id", existing_id).execute()
        return {"action": "update", "entity_id": existing_id, "previous_values": previous[0] if previous else None}

    if dry_run:
        return {"action": "create", "entity_id": None}
    row = {**payload, "created_by_import_job_id": job_id}
    created = db.table(table).insert(row).execute().data[0]
    return {"action": "create", "entity_id": created["id"]}


def summarize(results: list[dict]) -> dict:
    return {
        "will_create": sum(1 for r in results if r["action"] == "create"),
        "will_update": sum(1 for r in results if r["action"] == "update"),
        "will_skip": sum(1 for r in results if r["action"] == "skip"),
        "will_error": sum(1 for r in results if r["action"] == "error"),
    }


# ---------------------------------------------------------------------------
# Undo

_TABLE_BY_DATA_TYPE = {"patients": "patients", "services": "services", "staff": "staff", "appointments": "appointments"}


def _find_blocking_usages(db: Client, data_type: str, entity_ids: list[str], job_id: str) -> list[dict]:
    """Rows a created record has since been used in, that this job didn't
    itself create — the exact reason undo must be refused."""
    if not entity_ids:
        return []
    blocking: list[dict] = []

    if data_type == "patients":
        appts = (
            db.table("appointments")
            .select("id, patient_id, scheduled_at, created_by_import_job_id")
            .in_("patient_id", entity_ids)
            .execute()
            .data
        )
        for a in appts:
            if a.get("created_by_import_job_id") != job_id:
                blocking.append({"entity_id": a["patient_id"], "used_in": "appointment", "detail": a["scheduled_at"]})
        payments = db.table("payments").select("id, patient_id, amount").in_("patient_id", entity_ids).execute().data
        for p in payments:
            blocking.append({"entity_id": p["patient_id"], "used_in": "payment", "detail": str(p.get("amount"))})

    elif data_type == "services":
        appts = db.table("appointments").select("id, service_id, created_by_import_job_id").in_("service_id", entity_ids).execute().data
        for a in appts:
            if a.get("created_by_import_job_id") != job_id:
                blocking.append({"entity_id": a["service_id"], "used_in": "appointment", "detail": a["id"]})

    elif data_type == "staff":
        appts = db.table("appointments").select("id, staff_id, created_by_import_job_id").in_("staff_id", entity_ids).execute().data
        for a in appts:
            if a.get("created_by_import_job_id") != job_id:
                blocking.append({"entity_id": a["staff_id"], "used_in": "appointment", "detail": a["id"]})

    elif data_type == "appointments":
        payments = db.table("payments").select("id, appointment_id, amount").in_("appointment_id", entity_ids).execute().data
        for p in payments:
            blocking.append({"entity_id": p["appointment_id"], "used_in": "payment", "detail": str(p.get("amount"))})

    return blocking


def undo_job(db: Client, job: dict, staff_id: str) -> dict:
    now = datetime.now(timezone.utc)
    deadline = job.get("undo_deadline")
    if job["undo_status"] != "available":
        return {"undone": False, "reason": f"لا يمكن التراجع — حالة التراجع الحالية: {job['undo_status']}", "blocking": []}
    if deadline and datetime.fromisoformat(deadline) < now:
        db.table("import_jobs").update({"undo_status": "expired"}).eq("id", job["id"]).execute()
        return {"undone": False, "reason": "انتهت مهلة التراجع (7 أيام من الاستيراد)", "blocking": []}

    table = _TABLE_BY_DATA_TYPE[job["data_type"]]
    rows = db.table("import_job_rows").select("*").eq("job_id", job["id"]).in_("action", ["create", "update"]).execute().data
    created_ids = [r["entity_id"] for r in rows if r["action"] == "create" and r["entity_id"]]
    updated_rows = [r for r in rows if r["action"] == "update" and r["entity_id"]]

    blocking = _find_blocking_usages(db, job["data_type"], created_ids, job["id"])
    if blocking:
        db.table("audit_log").insert(
            {
                "entity_type": "import_job",
                "entity_id": job["id"],
                "action": "undo_refused",
                "new_value": {"blocking_count": len(blocking)},
                "user_id": staff_id,
            }
        ).execute()
        return {"undone": False, "reason": "تم استخدام بعض السجلات المستوردة في معاملات حقيقية — عالجها يدوياً أولاً", "blocking": blocking}

    if created_ids:
        db.table(table).update({"deleted_at": now.isoformat()}).in_("id", created_ids).execute()

    for r in updated_rows:
        previous = r.get("previous_values")
        if previous:
            restorable = {k: v for k, v in previous.items() if k not in ("id", "created_at", "created_by_import_job_id")}
            db.table(table).update(restorable).eq("id", r["entity_id"]).execute()

    db.table("import_jobs").update({"undo_status": "undone"}).eq("id", job["id"]).execute()
    db.table("audit_log").insert(
        {
            "entity_type": "import_job",
            "entity_id": job["id"],
            "action": "undo",
            "new_value": {"created_removed": len(created_ids), "updates_reverted": len(updated_rows)},
            "user_id": staff_id,
        }
    ).execute()
    return {"undone": True, "reason": None, "blocking": []}


def compute_undo_deadline() -> str:
    return (datetime.now(timezone.utc) + timedelta(days=UNDO_WINDOW_DAYS)).isoformat()
