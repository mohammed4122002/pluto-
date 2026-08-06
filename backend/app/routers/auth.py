import base64
import io
from datetime import datetime, timedelta, timezone

import jwt
import pyotp
import qrcode
from fastapi import APIRouter, Depends, HTTPException
from supabase import Client

from app.core.auth import CurrentStaff, _load_permissions, get_current_staff
from app.core.database import get_supabase
from app.core.security import (
    create_access_token,
    create_mfa_challenge_token,
    decode_mfa_challenge_token,
    decrypt_secret,
    encrypt_secret,
    hash_password,
    verify_password,
)
from app.models.schemas import (
    ChangePasswordRequest,
    LoginRequest,
    LoginResult,
    MfaConfirmRequest,
    MfaSetupResult,
    MfaVerifyRequest,
    StaffMe,
)

router = APIRouter(prefix="/auth", tags=["auth"])

_MAX_FAILED_ATTEMPTS = 5
_LOCKOUT_MINUTES = 15


def _staff_me(db: Client, staff_id: str) -> StaffMe:
    row = (
        db.table("staff")
        .select("id, full_name, email, role, mfa_enabled")
        .eq("id", staff_id)
        .limit(1)
        .execute()
        .data[0]
    )
    permissions = _load_permissions(db, staff_id)
    return StaffMe(**row, permissions=sorted(permissions.keys()))


@router.post("/login", response_model=LoginResult)
def login(payload: LoginRequest, db: Client = Depends(get_supabase)):
    rows = (
        db.table("staff")
        .select("id, password_hash, is_active, failed_login_attempts, locked_until, mfa_enabled")
        .eq("email", payload.email)
        .limit(1)
        .execute()
        .data
    )
    generic_error = HTTPException(status_code=401, detail="البريد الإلكتروني أو كلمة المرور غير صحيحة")
    if not rows or not rows[0]["password_hash"] or not rows[0]["is_active"]:
        raise generic_error
    staff = rows[0]

    if staff["locked_until"] and datetime.fromisoformat(staff["locked_until"]) > datetime.now(timezone.utc):
        raise HTTPException(status_code=423, detail="الحساب مقفل مؤقتاً بسبب محاولات دخول فاشلة متكررة — حاول لاحقاً")

    if not verify_password(payload.password, staff["password_hash"]):
        attempts = staff["failed_login_attempts"] + 1
        updates = {"failed_login_attempts": attempts}
        if attempts >= _MAX_FAILED_ATTEMPTS:
            updates["locked_until"] = (datetime.now(timezone.utc) + timedelta(minutes=_LOCKOUT_MINUTES)).isoformat()
        db.table("staff").update(updates).eq("id", staff["id"]).execute()
        raise generic_error

    db.table("staff").update({"failed_login_attempts": 0, "locked_until": None}).eq("id", staff["id"]).execute()

    if staff["mfa_enabled"]:
        return LoginResult(mfa_required=True, mfa_token=create_mfa_challenge_token(staff["id"]))

    db.table("staff").update({"last_login_at": datetime.now(timezone.utc).isoformat()}).eq("id", staff["id"]).execute()
    return LoginResult(access_token=create_access_token(staff["id"]), staff=_staff_me(db, staff["id"]))


@router.post("/mfa/verify", response_model=LoginResult)
def verify_mfa(payload: MfaVerifyRequest, db: Client = Depends(get_supabase)):
    try:
        staff_id = decode_mfa_challenge_token(payload.mfa_token)
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="انتهت صلاحية التحقق — سجّل الدخول من جديد")

    rows = db.table("staff").select("mfa_secret_encrypted, is_active").eq("id", staff_id).limit(1).execute().data
    if not rows or not rows[0]["is_active"] or not rows[0]["mfa_secret_encrypted"]:
        raise HTTPException(status_code=401, detail="الحساب غير موجود أو تم إيقافه")

    secret = decrypt_secret(rows[0]["mfa_secret_encrypted"])
    if not pyotp.TOTP(secret).verify(payload.code, valid_window=1):
        raise HTTPException(status_code=401, detail="رمز التحقق غير صحيح")

    db.table("staff").update({"last_login_at": datetime.now(timezone.utc).isoformat()}).eq("id", staff_id).execute()
    return LoginResult(access_token=create_access_token(staff_id), staff=_staff_me(db, staff_id))


@router.get("/me", response_model=StaffMe)
def me(current: CurrentStaff = Depends(get_current_staff), db: Client = Depends(get_supabase)):
    return _staff_me(db, current.id)


@router.post("/mfa/setup", response_model=MfaSetupResult)
def setup_mfa(current: CurrentStaff = Depends(get_current_staff), db: Client = Depends(get_supabase)):
    secret = pyotp.random_base32()
    db.table("staff").update({"mfa_secret_encrypted": encrypt_secret(secret), "mfa_enabled": False}).eq(
        "id", current.id
    ).execute()
    otpauth_url = pyotp.TOTP(secret).provisioning_uri(name=current.email, issuer_name="PLUTO")
    buf = io.BytesIO()
    qrcode.make(otpauth_url).save(buf, format="PNG")
    qr_data_uri = "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()
    return MfaSetupResult(secret=secret, otpauth_url=otpauth_url, qr_data_uri=qr_data_uri)


@router.post("/mfa/confirm")
def confirm_mfa(payload: MfaConfirmRequest, current: CurrentStaff = Depends(get_current_staff), db: Client = Depends(get_supabase)):
    rows = db.table("staff").select("mfa_secret_encrypted").eq("id", current.id).limit(1).execute().data
    if not rows or not rows[0]["mfa_secret_encrypted"]:
        raise HTTPException(status_code=400, detail="لم يتم إنشاء رمز MFA بعد — استدعِ /auth/mfa/setup أولاً")
    secret = decrypt_secret(rows[0]["mfa_secret_encrypted"])
    if not pyotp.TOTP(secret).verify(payload.code, valid_window=1):
        raise HTTPException(status_code=400, detail="رمز التحقق غير صحيح")
    db.table("staff").update({"mfa_enabled": True}).eq("id", current.id).execute()
    return {"mfa_enabled": True}


@router.post("/mfa/disable")
def disable_mfa(current: CurrentStaff = Depends(get_current_staff), db: Client = Depends(get_supabase)):
    db.table("staff").update({"mfa_enabled": False, "mfa_secret_encrypted": None}).eq("id", current.id).execute()
    return {"mfa_enabled": False}


@router.post("/change-password")
def change_password(
    payload: ChangePasswordRequest, current: CurrentStaff = Depends(get_current_staff), db: Client = Depends(get_supabase)
):
    rows = db.table("staff").select("password_hash").eq("id", current.id).limit(1).execute().data
    if not rows or not rows[0]["password_hash"] or not verify_password(payload.old_password, rows[0]["password_hash"]):
        raise HTTPException(status_code=400, detail="كلمة المرور الحالية غير صحيحة")
    db.table("staff").update({"password_hash": hash_password(payload.new_password)}).eq("id", current.id).execute()
    return {"changed": True}
