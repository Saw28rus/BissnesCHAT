from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import AppError
from app.core.security import hash_password, hash_token, new_token, utcnow, verify_missing_user, verify_password
from app.modules.accounts.models import User, UserSettings
from app.modules.audit.service import record
from app.modules.auth.models import AuthSession
from app.modules.conversations.models import Conversation


async def ensure_admin(session: AsyncSession) -> None:
    from app.core.config import get_settings

    settings = get_settings()
    existing = await session.scalar(select(User).where(User.role == "admin"))
    if existing is not None:
        return
    login = settings.admin_login.strip()
    taken = await session.scalar(select(User).where(func.lower(User.login) == login.casefold()))
    if taken is not None:
        raise RuntimeError("логин администратора уже занят кабинетом клиента")
    now = utcnow()
    admin = User(
        login=login,
        role="admin",
        password_hash=hash_password(settings.admin_password),
        display_name="Администратор",
        status="active",
        created_at=now,
    )
    session.add(admin)
    await session.flush()
    session.add(UserSettings(user_id=admin.id, theme="light", notifications_enabled=False))


async def authenticate(session: AsyncSession, login: str, password: str) -> User:
    user = await session.scalar(select(User).where(func.lower(User.login) == login.strip().casefold()))
    if user is None:
        verify_missing_user(password)
        raise AppError(401, "invalid_credentials")
    if not verify_password(user.password_hash, password):
        raise AppError(401, "invalid_credentials")
    if user.status != "active":
        raise AppError(403, "blocked")
    return user


async def open_session(session: AsyncSession, user: User) -> str:
    token = new_token()
    now = utcnow()
    session.add(
        AuthSession(
            token_hash=hash_token(token),
            user_id=user.id,
            created_at=now,
            last_seen_at=now,
        )
    )
    return token


async def revoke_current(session: AsyncSession, auth_session: AuthSession) -> None:
    auth_session.revoked_at = utcnow()


async def revoke_all(session: AsyncSession, user_id) -> None:
    await session.execute(
        update(AuthSession)
        .where(AuthSession.user_id == user_id, AuthSession.revoked_at.is_(None))
        .values(revoked_at=utcnow())
    )


async def change_own_password(
    session: AsyncSession,
    user: User,
    current_password: str,
    new_password: str,
) -> None:
    if user.role != "admin":
        raise AppError(404, "not_found")
    if not verify_password(user.password_hash, current_password):
        raise AppError(401, "invalid_credentials")
    user.password_hash = hash_password(new_password)
    await revoke_all(session, user.id)
    await record(session, user.id, "admin.password", user.id)


async def profile(session: AsyncSession, user: User) -> dict:
    settings = await session.get(UserSettings, user.id)
    conversation_id = None
    if user.role == "client":
        conversation = await session.scalar(select(Conversation).where(Conversation.client_id == user.id))
        if conversation is not None:
            conversation_id = str(conversation.id)
    return {
        "id": str(user.id),
        "login": user.login,
        "role": user.role,
        "display_name": user.display_name,
        "theme": settings.theme if settings else "light",
        "notifications_enabled": bool(settings.notifications_enabled) if settings else False,
        "conversation_id": conversation_id,
    }


async def update_settings(session: AsyncSession, user: User, theme: str | None, notifications: bool | None) -> dict:
    settings = await session.get(UserSettings, user.id)
    if settings is None:
        settings = UserSettings(user_id=user.id, theme="light", notifications_enabled=False)
        session.add(settings)
    if theme is not None:
        settings.theme = theme
    if notifications is not None:
        settings.notifications_enabled = notifications
    await session.flush()
    return await profile(session, user)


async def delete_user_sessions(session: AsyncSession, user_id) -> None:
    await session.execute(delete(AuthSession).where(AuthSession.user_id == user_id))
