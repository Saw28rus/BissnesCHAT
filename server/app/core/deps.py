from uuid import UUID

from fastapi import Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.errors import AppError
from app.core.security import hash_token, session_deadline, tokens_match, utcnow
from app.modules.auth.models import AuthSession
from app.modules.accounts.models import User


def client_ip(request: Request) -> str:
    settings = get_settings()
    if settings.trust_proxy:
        return request.headers.get("x-real-ip", "") or "proxy"
    if request.client is None:
        return "local"
    return request.client.host


def require_csrf(request: Request) -> None:
    settings = get_settings()
    cookie = request.cookies.get(settings.csrf_cookie, "")
    header = request.headers.get("x-csrf-token", "")
    if not cookie or not header or not tokens_match(cookie, header):
        raise AppError(403, "csrf")


def set_csrf_cookie(response, token: str) -> None:
    settings = get_settings()
    response.set_cookie(
        key=settings.csrf_cookie,
        value=token,
        httponly=False,
        secure=settings.cookie_secure,
        samesite="lax",
        path="/",
        max_age=60 * 60 * 24 * settings.session_days,
    )


def set_session_cookie(response, token: str) -> None:
    settings = get_settings()
    response.set_cookie(
        key=settings.session_cookie,
        value=token,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
        path="/",
        max_age=60 * 60 * 24 * settings.session_days,
    )


def clear_auth_cookies(response) -> None:
    settings = get_settings()
    response.delete_cookie(settings.session_cookie, path="/")
    response.delete_cookie(settings.csrf_cookie, path="/")


async def load_user(request: Request, session: AsyncSession) -> tuple[User, AuthSession]:
    settings = get_settings()
    token = request.cookies.get(settings.session_cookie, "")
    if not token:
        raise AppError(401, "unauthorized")
    auth_session = await session.scalar(
        select(AuthSession).where(AuthSession.token_hash == hash_token(token))
    )
    now = utcnow()
    if auth_session is None or auth_session.revoked_at is not None:
        raise AppError(401, "unauthorized")
    created = auth_session.created_at
    if created.tzinfo is None:
        from datetime import UTC

        created = created.replace(tzinfo=UTC)
    if now >= session_deadline(created):
        raise AppError(401, "unauthorized")
    user = await session.get(User, auth_session.user_id)
    if user is None:
        raise AppError(401, "unauthorized")
    if user.status != "active":
        raise AppError(403, "blocked")
    if auth_session.last_seen_at is None or (now - _aware(auth_session.last_seen_at)).total_seconds() > 60:
        auth_session.last_seen_at = now
    return user, auth_session


def _aware(value):
    from datetime import UTC

    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value


async def require_user(request: Request, session: AsyncSession) -> User:
    user, _auth_session = await load_user(request, session)
    return user


async def require_admin(request: Request, session: AsyncSession) -> User:
    user = await require_user(request, session)
    if user.role != "admin":
        raise AppError(404, "not_found")
    return user


def current_session_id(request: Request, auth_session: AuthSession) -> UUID:
    return auth_session.id
