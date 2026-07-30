from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from supabase import Client

from app.core.database import get_supabase
from app.core.rbac import sync_legacy_role
from app.core.security import hash_password
from app.models.schemas import SetupRequest, SetupResult, SetupStatus

router = APIRouter(prefix="/setup", tags=["setup"])


@router.get("/status", response_model=SetupStatus)
def get_setup_status(db: Client = Depends(get_supabase)):
    """A fresh deployment has an empty clinic_settings.clinic_name — the
    dashboard shows the first-run wizard until this is set."""
    row = db.table("clinic_settings").select("clinic_name").limit(1).execute().data
    initialized = bool(row and row[0]["clinic_name"].strip())
    return SetupStatus(initialized=initialized)


@router.post("/complete", response_model=SetupResult)
def complete_setup(payload: SetupRequest, db: Client = Depends(get_supabase)):
    settings_row = db.table("clinic_settings").select("id, clinic_name").limit(1).execute().data
    if settings_row and settings_row[0]["clinic_name"].strip():
        raise HTTPException(status_code=409, detail="العيادة معدّة مسبقاً — ما ينعاد تشغيل معالج الإعداد الأولي.")

    branch = (
        db.table("branches")
        .insert(
            {
                "name": payload.branch.name,
                "address": payload.branch.address,
                "working_hours_note": payload.branch.working_hours_note,
            }
        )
        .execute()
        .data[0]
    )

    admin = (
        db.table("staff")
        .insert(
            {
                "full_name": payload.admin.full_name,
                "email": payload.admin.email,
                "phone": payload.admin.phone,
                "role": "admin",
                "password_hash": hash_password(payload.admin.password),
            }
        )
        .execute()
        .data[0]
    )
    db.table("staff_branches").insert({"staff_id": admin["id"], "branch_id": branch["id"]}).execute()
    sync_legacy_role(db, admin["id"], "admin", [branch["id"]])

    if settings_row:
        db.table("clinic_settings").update(
            {"clinic_name": payload.clinic_name, "updated_at": datetime.now(timezone.utc).isoformat()}
        ).eq("id", settings_row[0]["id"]).execute()
    else:
        db.table("clinic_settings").insert({"clinic_name": payload.clinic_name, "about_text": ""}).execute()

    return SetupResult(branch_id=branch["id"], admin_staff_id=admin["id"])
