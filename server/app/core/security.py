import hashlib
import os
import secrets
from datetime import UTC, datetime, timedelta

from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError

if os.getenv("ENVIRONMENT") == "test":
    _hasher = PasswordHasher(time_cost=1, memory_cost=8, parallelism=1)
else:
    _hasher = PasswordHasher()
_dummy_hash = _hasher.hash("not-a-real-password")


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password_hash: str, password: str) -> bool:
    try:
        return _hasher.verify(password_hash, password)
    except VerifyMismatchError:
        return False


def verify_missing_user(password: str) -> None:
    verify_password(_dummy_hash, password)


def new_token() -> str:
    return secrets.token_urlsafe(32)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def tokens_match(left: str, right: str) -> bool:
    return secrets.compare_digest(left, right)


def utcnow() -> datetime:
    return datetime.now(UTC)


def session_deadline(created_at: datetime) -> datetime:
    from app.core.config import get_settings

    return created_at + timedelta(days=get_settings().session_days)
