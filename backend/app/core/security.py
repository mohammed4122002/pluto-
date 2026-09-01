import hashlib
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from cryptography.fernet import Fernet

from app.core.config import get_settings

JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_HOURS = 12


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode(), password_hash.encode())
    except ValueError:
        return False


def create_access_token(staff_id: str) -> str:
    settings = get_settings()
    now = datetime.now(timezone.utc)
    payload = {"sub": staff_id, "typ": "access", "iat": now, "exp": now + timedelta(hours=ACCESS_TOKEN_EXPIRE_HOURS)}
    return jwt.encode(payload, settings.jwt_secret, algorithm=JWT_ALGORITHM)


def decode_access_token(token: str) -> str:
    """Returns the staff_id encoded in the token. Raises jwt.PyJWTError (expired,
    malformed, bad signature) if the token isn't valid — callers turn that into 401."""
    settings = get_settings()
    payload = jwt.decode(token, settings.jwt_secret, algorithms=[JWT_ALGORITHM])
    if payload.get("typ") != "access":
        raise jwt.InvalidTokenError("not an access token")
    return payload["sub"]


def create_mfa_challenge_token(staff_id: str) -> str:
    settings = get_settings()
    now = datetime.now(timezone.utc)
    payload = {"sub": staff_id, "typ": "mfa", "iat": now, "exp": now + timedelta(minutes=5)}
    return jwt.encode(payload, settings.jwt_secret, algorithm=JWT_ALGORITHM)


def decode_mfa_challenge_token(token: str) -> str:
    settings = get_settings()
    payload = jwt.decode(token, settings.jwt_secret, algorithms=[JWT_ALGORITHM])
    if payload.get("typ") != "mfa":
        raise jwt.InvalidTokenError("not an mfa challenge token")
    return payload["sub"]


def _fernet() -> Fernet:
    return Fernet(get_settings().encryption_key.encode())


def encrypt_secret(value: str) -> str:
    return _fernet().encrypt(value.encode()).decode()


def decrypt_secret(value: str) -> str:
    return _fernet().decrypt(value.encode()).decode()


def hash_reset_token(token: str) -> str:
    """A reset token is a single high-entropy random value used once and
    within minutes, unlike a password -- a fast deterministic hash (rather
    than bcrypt's slow, salted one) is the right tool, and lets lookup match
    by hash directly instead of fetching every unexpired token to compare."""
    return hashlib.sha256(token.encode()).hexdigest()
