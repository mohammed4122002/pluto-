import jwt
from fastapi import Depends, Header, HTTPException
from supabase import Client

from app.core.database import get_supabase
from app.core.security import decode_access_token


class CurrentStaff:
    def __init__(self, id: str, full_name: str, email: str, role: str, permissions: dict[str, set]):
        self.id = id
        self.full_name = full_name
        self.email = email
        self.role = role
        self.permissions = permissions

    def has_permission(self, code: str) -> bool:
        return code in self.permissions


def _load_permissions(db: Client, staff_id: str) -> dict[str, set]:
    user_roles = db.table("user_roles").select("role_id, branch_id").eq("staff_id", staff_id).execute().data
    permissions: dict[str, set] = {}
    if not user_roles:
        return permissions

    role_ids = list({r["role_id"] for r in user_roles})
    rp_rows = (
        db.table("role_permissions")
        .select("role_id, permissions(code)")
        .in_("role_id", role_ids)
        .execute()
        .data
    )
    role_to_codes: dict[str, set[str]] = {}
    for row in rp_rows:
        perm = row.get("permissions")
        if perm:
            role_to_codes.setdefault(row["role_id"], set()).add(perm["code"])

    for ur in user_roles:
        for code in role_to_codes.get(ur["role_id"], set()):
            permissions.setdefault(code, set()).add(ur["branch_id"])
    return permissions


def get_current_staff(
    authorization: str | None = Header(default=None), db: Client = Depends(get_supabase)
) -> CurrentStaff:
    """Re-verifies staff.is_active and reloads permissions fresh from the DB on
    every request — this is what makes deactivating a user or changing their
    role take effect immediately, with no separate session-revocation table."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="تسجيل الدخول مطلوب")
    token = authorization.removeprefix("Bearer ").strip()
    try:
        staff_id = decode_access_token(token)
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="جلسة غير صالحة أو منتهية — سجّل الدخول من جديد")

    rows = db.table("staff").select("id, full_name, email, role, is_active").eq("id", staff_id).limit(1).execute().data
    if not rows or not rows[0]["is_active"]:
        raise HTTPException(status_code=401, detail="الحساب غير موجود أو تم إيقافه")
    staff = rows[0]

    permissions = _load_permissions(db, staff_id)
    return CurrentStaff(
        id=staff["id"], full_name=staff["full_name"], email=staff["email"], role=staff["role"], permissions=permissions
    )


def require_permission(code: str):
    def _dep(current: CurrentStaff = Depends(get_current_staff)) -> CurrentStaff:
        if not current.has_permission(code):
            raise HTTPException(status_code=403, detail="ليست لديك صلاحية لهذا الإجراء")
        return current

    return _dep


def assert_branch_access(current: CurrentStaff, code: str, branch_id: str | None) -> None:
    scopes = current.permissions.get(code)
    if not scopes:
        raise HTTPException(status_code=403, detail="ليست لديك صلاحية لهذا الإجراء")
    if None in scopes:
        return
    if branch_id is None or branch_id not in scopes:
        raise HTTPException(status_code=403, detail="ليست لديك صلاحية على هذا الفرع")


def allowed_branch_ids(current: CurrentStaff, code: str) -> list[str] | None:
    """None => org-wide grant, caller should apply no branch filter. Otherwise
    the exact list of branch_ids the caller may see for this permission
    (empty list => no access to any branch)."""
    scopes = current.permissions.get(code)
    if not scopes:
        return []
    if None in scopes:
        return None
    return [s for s in scopes if s is not None]
