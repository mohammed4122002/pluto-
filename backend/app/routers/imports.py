import io
import json
from datetime import datetime, timedelta, timezone
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, Form, HTTPException, UploadFile
from fastapi.responses import PlainTextResponse, StreamingResponse
from openpyxl import Workbook
from supabase import Client

from app.core.auth import CurrentStaff, assert_branch_access, get_current_staff, require_permission
from app.core.database import get_supabase
from app.core.security import encrypt_secret
from app.core.service_auth import require_service_token
from app.models.schemas import (
    DryRunRequest,
    DryRunResult,
    ImportFieldInfo,
    ImportJob,
    ImportProfile,
    ImportProfileCreate,
    ScanPromptsRequest,
    SourcePreviewRequest,
    SourcePreviewResult,
    UndoResult,
)
from app.services import import_connectors as connectors
from app.services.import_engine import compute_undo_deadline, process_rows, scan_for_date_prompts, summarize, undo_job
from app.services.import_fields import DATA_TYPES, FIELD_DEFINITIONS, MATCH_KEY_OPTIONS
from app.services.import_matching import missing_required_fields, suggest_mapping

router = APIRouter(prefix="/imports", tags=["imports"])

CREATE_PERMISSION = {
    "patients": "patient.create",
    "services": "service.create",
    "staff": "staff.create",
    "appointments": "appointment.create",
}


def _require_data_type_access(current: CurrentStaff, data_type: str, branch_id: str | None) -> None:
    code = CREATE_PERMISSION[data_type]
    if not current.has_permission(code):
        raise HTTPException(status_code=403, detail="ليست لديك صلاحية لهذا الإجراء")
    if branch_id and data_type in ("staff", "appointments"):
        assert_branch_access(current, code, branch_id)


@router.get("/data-types")
def list_data_types(_current: CurrentStaff = Depends(require_permission("import.view"))):
    labels = {"patients": "المرضى", "services": "الخدمات", "staff": "الموظفين", "appointments": "المواعيد"}
    return [{"value": dt, "label": labels[dt]} for dt in DATA_TYPES]


@router.get("/fields", response_model=list[ImportFieldInfo])
def get_fields(data_type: str, _current: CurrentStaff = Depends(require_permission("import.view"))):
    if data_type not in FIELD_DEFINITIONS:
        raise HTTPException(status_code=400, detail="نوع بيانات غير معروف")
    return [
        ImportFieldInfo(name=name, label=d["label"], required=d["required"], kind=d["kind"])
        for name, d in FIELD_DEFINITIONS[data_type].items()
    ]


@router.get("/match-key-options")
def get_match_key_options(data_type: str, _current: CurrentStaff = Depends(require_permission("import.view"))):
    return MATCH_KEY_OPTIONS.get(data_type, [])


@router.post("/preview-source/file", response_model=SourcePreviewResult)
def preview_file(
    data_type: str = Form(...),
    sheet_tab: str | None = Form(None),
    file: UploadFile = None,
    current: CurrentStaff = Depends(get_current_staff),
):
    if data_type not in FIELD_DEFINITIONS:
        raise HTTPException(status_code=400, detail="نوع بيانات غير معروف")
    _require_data_type_access(current, data_type, None)
    if not file or not file.filename:
        raise HTTPException(status_code=400, detail="لم يتم رفع ملف")

    content = file.file.read()
    tabs: list[str] = []
    if file.filename.lower().endswith((".xlsx", ".xlsm")):
        tabs = connectors.list_excel_sheets(content)
        columns, rows = connectors.read_excel_sheet(content, sheet_tab or tabs[0])
    else:
        columns, rows = connectors.read_file(content, file.filename)

    return SourcePreviewResult(
        columns=columns,
        sample_rows=rows[:20],
        rows=rows,
        suggested_mapping=suggest_mapping(data_type, columns),
        available_tabs=tabs,
    )


@router.post("/test-google-sheets")
def test_google_sheets(
    payload: SourcePreviewRequest, current: CurrentStaff = Depends(get_current_staff)
):
    if not payload.service_account_json or not payload.spreadsheet_id:
        raise HTTPException(status_code=400, detail="أدخل مفتاح حساب الخدمة ومعرّف الشيت")
    try:
        service_account = json.loads(payload.service_account_json)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="ملف حساب الخدمة (JSON) غير صالح")
    try:
        info = connectors.google_sheets_verify(service_account, payload.spreadsheet_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return {"title": info["title"], "tabs": info["tabs"]}


@router.post("/preview-source/google-sheets", response_model=SourcePreviewResult)
def preview_google_sheets(payload: SourcePreviewRequest, current: CurrentStaff = Depends(get_current_staff)):
    if payload.data_type not in FIELD_DEFINITIONS:
        raise HTTPException(status_code=400, detail="نوع بيانات غير معروف")
    _require_data_type_access(current, payload.data_type, None)
    if not payload.service_account_json or not payload.spreadsheet_id or not payload.sheet_tab:
        raise HTTPException(status_code=400, detail="أدخل بيانات الاتصال واختر التبويب")
    try:
        service_account = json.loads(payload.service_account_json)
        columns, rows = connectors.google_sheets_read(service_account, payload.spreadsheet_id, payload.sheet_tab)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="ملف حساب الخدمة (JSON) غير صالح")

    return SourcePreviewResult(
        columns=columns, sample_rows=rows[:20], rows=rows, suggested_mapping=suggest_mapping(payload.data_type, columns)
    )


@router.post("/test-postgres")
def test_postgres(payload: SourcePreviewRequest, current: CurrentStaff = Depends(get_current_staff)):
    if not payload.connection_string:
        raise HTTPException(status_code=400, detail="أدخل connection string")
    try:
        tables = connectors.postgres_list_tables(payload.connection_string)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=f"تعذر الاتصال — تأكد من الرابط ومن SSL: {exc}")
    return {"tables": tables}


@router.post("/preview-source/postgres", response_model=SourcePreviewResult)
def preview_postgres(payload: SourcePreviewRequest, current: CurrentStaff = Depends(get_current_staff)):
    if payload.data_type not in FIELD_DEFINITIONS:
        raise HTTPException(status_code=400, detail="نوع بيانات غير معروف")
    _require_data_type_access(current, payload.data_type, None)
    if not payload.connection_string or not payload.table_name:
        raise HTTPException(status_code=400, detail="أدخل بيانات الاتصال واختر الجدول")
    try:
        columns, rows = connectors.postgres_read_table(payload.connection_string, payload.table_name)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=f"تعذر قراءة الجدول: {exc}")

    return SourcePreviewResult(
        columns=columns, sample_rows=rows[:20], rows=rows, suggested_mapping=suggest_mapping(payload.data_type, columns)
    )


@router.get("/sqlserver-export-script")
def sqlserver_export_script(data_type: str, _current: CurrentStaff = Depends(require_permission("import.view"))):
    if data_type not in FIELD_DEFINITIONS:
        raise HTTPException(status_code=400, detail="نوع بيانات غير معروف")
    columns = list(FIELD_DEFINITIONS[data_type].keys())
    script = f'''"""
سكربت تصدير جاهز لبيانات {data_type} من SQL Server محلي إلى ملف Excel قابل
للرفع مباشرة في معالج الاستيراد. عادة لا يمكن الوصول لخادم SQL Server من
الإنترنت مباشرة، لذلك هذا هو المسار الافتراضي بدل الاتصال المباشر.

المتطلبات: pip install pyodbc openpyxl
عدّل بيانات الاتصال أدناه ثم شغّل: python export_{data_type}.py
"""
import pyodbc
from openpyxl import Workbook

CONNECTION_STRING = (
    "DRIVER={{ODBC Driver 17 for SQL Server}};"
    "SERVER=YOUR_SERVER;DATABASE=YOUR_DATABASE;UID=YOUR_USER;PWD=YOUR_PASSWORD"
)

# عدّل استعلام SELECT ليطابق أسماء الأعمدة الحقيقية عندك — الأعمدة المتوقعة
# في معالج الاستيراد هي: {", ".join(columns)}
QUERY = "SELECT * FROM YOUR_TABLE_NAME"

conn = pyodbc.connect(CONNECTION_STRING)
cursor = conn.cursor()
cursor.execute(QUERY)

wb = Workbook()
ws = wb.active
ws.append([col[0] for col in cursor.description])
for row in cursor.fetchall():
    ws.append(list(row))

wb.save("{data_type}_export.xlsx")
print("تم التصدير إلى {data_type}_export.xlsx — ارفعه الآن في معالج الاستيراد")
'''
    return PlainTextResponse(
        script, media_type="text/x-python", headers={"Content-Disposition": f"attachment; filename=export_{data_type}.py"}
    )


@router.post("/scan-prompts")
def scan_prompts(payload: ScanPromptsRequest, _current: CurrentStaff = Depends(get_current_staff)):
    prompt = scan_for_date_prompts(payload.rows, payload.column_mapping, payload.data_type, payload.options)
    return {"prompt": prompt}


def _create_job_with_rows(db: Client, data_type, source_type, source_label, branch_id, column_mapping, options, profile_id, created_by, rows, dry_run: bool):
    job = (
        db.table("import_jobs")
        .insert(
            {
                "data_type": data_type,
                "source_type": source_type,
                "source_label": source_label,
                "branch_id": str(branch_id) if branch_id else None,
                "column_mapping": column_mapping,
                "options": options,
                "profile_id": str(profile_id) if profile_id else None,
                "status": "dry_run",
                "total_rows": len(rows),
                "created_by": created_by,
            }
        )
        .execute()
        .data[0]
    )
    results = process_rows(db, data_type, str(branch_id) if branch_id else None, rows, column_mapping, options, dry_run=True, job_id=job["id"])
    if results:
        db.table("import_job_rows").insert(
            [
                {
                    "job_id": job["id"],
                    "row_number": r["row_number"],
                    "action": r["action"],
                    "reason": r["reason"],
                    "entity_id": r["entity_id"],
                    "raw_data": r["raw_data"],
                }
                for r in results
            ]
        ).execute()
    summary = summarize(results)
    job = db.table("import_jobs").update(summary).eq("id", job["id"]).execute().data[0]
    return job, results


@router.post("/dry-run", response_model=DryRunResult)
def dry_run(payload: DryRunRequest, current: CurrentStaff = Depends(get_current_staff), db: Client = Depends(get_supabase)):
    if payload.data_type not in FIELD_DEFINITIONS:
        raise HTTPException(status_code=400, detail="نوع بيانات غير معروف")
    _require_data_type_access(current, payload.data_type, str(payload.branch_id) if payload.branch_id else None)

    missing = missing_required_fields(payload.data_type, payload.column_mapping)
    if missing:
        labels = [FIELD_DEFINITIONS[payload.data_type][f]["label"] for f in missing]
        raise HTTPException(status_code=400, detail=f"حقول مطلوبة غير مطابَقة: {', '.join(labels)}")

    prompt = scan_for_date_prompts(payload.rows, payload.column_mapping, payload.data_type, payload.options)
    if prompt:
        raise HTTPException(status_code=409, detail={"needs_clarification": True, **prompt})

    job, results = _create_job_with_rows(
        db, payload.data_type, payload.source_type, payload.source_label, payload.branch_id,
        payload.column_mapping, payload.options, payload.profile_id, current.id, payload.rows, dry_run=True,
    )
    row_out = [{"row_number": r["row_number"], "action": r["action"], "reason": r["reason"], "entity_id": r["entity_id"], "raw_data": r["raw_data"]} for r in results]
    return DryRunResult(job=ImportJob(**job), rows=row_out)


def _run_execute(job_id: str):
    db = get_supabase()
    job = db.table("import_jobs").select("*").eq("id", job_id).single().execute().data
    rows_data = db.table("import_job_rows").select("*").eq("job_id", job_id).order("row_number").execute().data
    raw_rows = [r["raw_data"] for r in rows_data]

    try:
        results = process_rows(
            db, job["data_type"], job.get("branch_id"), raw_rows, job["column_mapping"], job["options"], dry_run=False, job_id=job_id
        )
        for i in range(0, len(results), 25):
            batch = results[i : i + 25]
            for r in batch:
                db.table("import_job_rows").update(
                    {"action": r["action"], "reason": r["reason"], "entity_id": r["entity_id"], "previous_values": r.get("previous_values")}
                ).eq("job_id", job_id).eq("row_number", r["row_number"]).execute()
            db.table("import_jobs").update({"processed_count": min(i + 25, len(results))}).eq("id", job_id).execute()

        summary = {
            "created_count": sum(1 for r in results if r["action"] == "create"),
            "updated_count": sum(1 for r in results if r["action"] == "update"),
            "skipped_count": sum(1 for r in results if r["action"] == "skip"),
            "error_count": sum(1 for r in results if r["action"] == "error"),
        }
        has_changes = summary["created_count"] > 0 or summary["updated_count"] > 0
        db.table("import_jobs").update(
            {
                **summary,
                "status": "completed",
                "processed_count": len(results),
                "completed_at": datetime.now(timezone.utc).isoformat(),
                "undo_status": "available" if has_changes else "not_applicable",
                "undo_deadline": compute_undo_deadline() if has_changes else None,
            }
        ).eq("id", job_id).execute()
    except Exception as exc:  # noqa: BLE001
        db.table("import_jobs").update({"status": "failed", "error_message": str(exc)}).eq("id", job_id).execute()


@router.post("/jobs/{job_id}/execute", response_model=ImportJob)
def execute(job_id: UUID, background_tasks: BackgroundTasks, current: CurrentStaff = Depends(get_current_staff), db: Client = Depends(get_supabase)):
    job = db.table("import_jobs").select("*").eq("id", str(job_id)).limit(1).execute().data
    if not job:
        raise HTTPException(status_code=404, detail="المهمة غير موجودة")
    job = job[0]
    _require_data_type_access(current, job["data_type"], job.get("branch_id"))
    if job["status"] != "dry_run":
        raise HTTPException(status_code=400, detail="هذه المهمة نُفّذت مسبقاً أو ما زالت قيد التنفيذ")

    updated = db.table("import_jobs").update({"status": "running"}).eq("id", str(job_id)).execute().data[0]
    background_tasks.add_task(_run_execute, str(job_id))
    db.table("audit_log").insert(
        {"entity_type": "import_job", "entity_id": str(job_id), "action": "execute", "user_id": current.id}
    ).execute()
    return ImportJob(**updated)


@router.get("/jobs", response_model=list[ImportJob])
def list_jobs(data_type: str | None = None, _current: CurrentStaff = Depends(require_permission("import.view")), db: Client = Depends(get_supabase)):
    query = db.table("import_jobs").select("*").order("created_at", desc=True).limit(100)
    if data_type:
        query = query.eq("data_type", data_type)
    return query.execute().data


@router.get("/jobs/{job_id}", response_model=ImportJob)
def get_job(job_id: UUID, _current: CurrentStaff = Depends(require_permission("import.view")), db: Client = Depends(get_supabase)):
    row = db.table("import_jobs").select("*").eq("id", str(job_id)).limit(1).execute().data
    if not row:
        raise HTTPException(status_code=404, detail="المهمة غير موجودة")
    return row[0]


@router.get("/jobs/{job_id}/rows")
def get_job_rows(job_id: UUID, action: str | None = None, _current: CurrentStaff = Depends(require_permission("import.view")), db: Client = Depends(get_supabase)):
    query = db.table("import_job_rows").select("row_number, action, reason, entity_id, raw_data").eq("job_id", str(job_id)).order("row_number")
    if action:
        query = query.eq("action", action)
    return query.execute().data


def _build_report_workbook(rows: list[dict]) -> bytes:
    wb = Workbook()
    ws = wb.active
    ws.append(["الصف", "الإجراء", "السبب", "البيانات"])
    action_ar = {"create": "أُضيف", "update": "تحدّث", "skip": "تجاهل", "error": "خطأ"}
    for r in rows:
        ws.append([r["row_number"], action_ar.get(r["action"], r["action"]), r.get("reason") or "", json.dumps(r["raw_data"], ensure_ascii=False)])
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


@router.get("/jobs/{job_id}/report")
def download_report(job_id: UUID, _current: CurrentStaff = Depends(require_permission("import.view")), db: Client = Depends(get_supabase)):
    rows = db.table("import_job_rows").select("row_number, action, reason, raw_data").eq("job_id", str(job_id)).order("row_number").execute().data
    content = _build_report_workbook(rows)
    return StreamingResponse(
        io.BytesIO(content),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename=import_report_{job_id}.xlsx"},
    )


@router.get("/jobs/{job_id}/error-report")
def download_error_report(job_id: UUID, _current: CurrentStaff = Depends(require_permission("import.view")), db: Client = Depends(get_supabase)):
    rows = db.table("import_job_rows").select("row_number, action, reason, raw_data").eq("job_id", str(job_id)).eq("action", "error").order("row_number").execute().data
    content = _build_report_workbook(rows)
    return StreamingResponse(
        io.BytesIO(content),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename=import_errors_{job_id}.xlsx"},
    )


@router.post("/jobs/{job_id}/undo", response_model=UndoResult)
def undo(job_id: UUID, current: CurrentStaff = Depends(require_permission("import.undo")), db: Client = Depends(get_supabase)):
    job = db.table("import_jobs").select("*").eq("id", str(job_id)).limit(1).execute().data
    if not job:
        raise HTTPException(status_code=404, detail="المهمة غير موجودة")
    result = undo_job(db, job[0], current.id)
    return UndoResult(**result)


@router.post("/profiles", response_model=ImportProfile)
def create_profile(payload: ImportProfileCreate, current: CurrentStaff = Depends(get_current_staff), db: Client = Depends(get_supabase)):
    _require_data_type_access(current, payload.data_type, str(payload.branch_id) if payload.branch_id else None)
    row = {
        "name": payload.name,
        "data_type": payload.data_type,
        "source_type": payload.source_type,
        "branch_id": str(payload.branch_id) if payload.branch_id else None,
        "column_mapping": payload.column_mapping,
        "options": payload.options,
        "source_config": payload.source_config,
        "created_by": current.id,
    }
    if payload.credentials:
        row["source_credentials_encrypted"] = encrypt_secret(json.dumps(payload.credentials))
    if payload.sync_interval_hours:
        row["sync_interval_hours"] = payload.sync_interval_hours
        row["next_sync_at"] = (datetime.now(timezone.utc) + timedelta(hours=payload.sync_interval_hours)).isoformat()
    return db.table("import_profiles").insert(row).execute().data[0]


@router.get("/profiles", response_model=list[ImportProfile])
def list_profiles(data_type: str | None = None, _current: CurrentStaff = Depends(require_permission("import.view")), db: Client = Depends(get_supabase)):
    query = db.table("import_profiles").select("*").order("created_at", desc=True)
    if data_type:
        query = query.eq("data_type", data_type)
    return query.execute().data


def _run_profile_sync(db: Client, profile: dict) -> dict:
    creds = connectors.decrypt_source_credentials(profile.get("source_credentials_encrypted"))
    config = profile["source_config"]
    if profile["source_type"] == "google_sheets":
        columns, rows = connectors.google_sheets_read(creds, config["spreadsheet_id"], config["sheet_tab"])
    elif profile["source_type"] == "postgres":
        columns, rows = connectors.postgres_read_table(creds.get("connection_string") or config.get("connection_string"), config["table_name"])
    else:
        raise ValueError("هذا النوع من المصادر لا يدعم المزامنة التلقائية")

    job, results = _create_job_with_rows(
        db, profile["data_type"], profile["source_type"], profile["name"], profile.get("branch_id"),
        profile["column_mapping"], profile["options"], profile["id"], profile.get("created_by"), rows, dry_run=True,
    )
    error_ratio = (job["will_error"] / len(results)) if results else 0
    if error_ratio > 0.5:
        db.table("import_profiles").update(
            {"last_sync_status": "alert", "last_sync_error": f"نسبة أخطاء مرتفعة ({job['will_error']} من {len(results)}) — لم تُنفَّذ المزامنة تلقائياً، راجع تطابق الأعمدة"}
        ).eq("id", profile["id"]).execute()
        return job

    db.table("import_jobs").update({"status": "running"}).eq("id", job["id"]).execute()
    _run_execute(job["id"])
    db.table("import_profiles").update({"last_sync_status": "ok", "last_sync_error": None}).eq("id", profile["id"]).execute()
    return db.table("import_jobs").select("*").eq("id", job["id"]).single().execute().data


@router.post("/profiles/{profile_id}/sync-now", response_model=ImportJob)
def sync_now(profile_id: UUID, current: CurrentStaff = Depends(get_current_staff), db: Client = Depends(get_supabase)):
    profile = db.table("import_profiles").select("*").eq("id", str(profile_id)).limit(1).execute().data
    if not profile:
        raise HTTPException(status_code=404, detail="الملف الشخصي غير موجود")
    profile = profile[0]
    _require_data_type_access(current, profile["data_type"], profile.get("branch_id"))
    try:
        job = _run_profile_sync(db, profile)
    except Exception as exc:  # noqa: BLE001
        db.table("import_profiles").update({"last_sync_status": "failed", "last_sync_error": str(exc)}).eq("id", str(profile_id)).execute()
        raise HTTPException(status_code=400, detail=f"فشلت المزامنة: {exc}")
    if profile.get("sync_interval_hours"):
        db.table("import_profiles").update(
            {"last_synced_at": datetime.now(timezone.utc).isoformat(), "next_sync_at": (datetime.now(timezone.utc) + timedelta(hours=profile["sync_interval_hours"])).isoformat()}
        ).eq("id", str(profile_id)).execute()
    return ImportJob(**job)


@router.post("/sheets-sync/process-due", dependencies=[Depends(require_service_token)])
def process_due_syncs(db: Client = Depends(get_supabase)):
    """Called by an external scheduler (n8n Cron), exactly like
    /notifications/process-due — this backend never runs its own cron."""
    now = datetime.now(timezone.utc).isoformat()
    due = (
        db.table("import_profiles")
        .select("*")
        .eq("source_type", "google_sheets")
        .not_.is_("next_sync_at", "null")
        .lte("next_sync_at", now)
        .execute()
        .data
    )
    processed, failed = 0, 0
    for profile in due:
        try:
            _run_profile_sync(db, profile)
            processed += 1
        except Exception as exc:  # noqa: BLE001
            db.table("import_profiles").update({"last_sync_status": "failed", "last_sync_error": str(exc)}).eq("id", profile["id"]).execute()
            failed += 1
        db.table("import_profiles").update(
            {"last_synced_at": now, "next_sync_at": (datetime.now(timezone.utc) + timedelta(hours=profile["sync_interval_hours"])).isoformat()}
        ).eq("id", profile["id"]).execute()
    return {"processed": processed, "failed": failed}
