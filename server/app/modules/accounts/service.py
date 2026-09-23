import uuid
from datetime import UTC, datetime

from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import AppError
from app.core.security import hash_password, utcnow
from app.modules.accounts.models import User, UserSettings
from app.modules.accounts.schemas import AccountCreate, AccountUpdate
from app.modules.attachments.models import Attachment
from app.modules.audit.service import record
from app.modules.auth.models import AuthSession
from app.modules.auth.service import revoke_all
from app.modules.conversations.models import Conversation, Message, MessageRevision


def _iso(value: datetime | None) -> str | None:
    if value is None:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=UTC)
    return value.isoformat()


def _preview(message: Message | None) -> str | None:
    if message is None:
        return None
    if message.deleted_at is not None:
        return "Сообщение удалено"
    if message.type == "file":
        return "Файл"
    if message.type == "voice":
        return "Голосовое"
    text = message.body.strip()
    return text[:80]


async def _login_taken(session: AsyncSession, login: str, except_id: uuid.UUID | None = None) -> bool:
    found = await session.scalar(select(User.id).where(func.lower(User.login) == login.casefold()))
    return found is not None and found != except_id


async def _client_or_404(session: AsyncSession, account_id: uuid.UUID) -> User:
    user = await session.get(User, account_id)
    if user is None or user.role != "client":
        raise AppError(404, "not_found")
    return user


async def list_clients(session: AsyncSession, query: str) -> list[dict]:
    stmt = select(User).where(User.role == "client").order_by(User.display_name)
    if query.strip():
        needle = f"%{query.strip().casefold()}%"
        stmt = stmt.where(
            func.lower(User.display_name).like(needle) | func.lower(User.login).like(needle)
        )
    clients = (await session.scalars(stmt)).all()
    if not clients:
        return []
    ids = [client.id for client in clients]
    conversations = (
        await session.scalars(select(Conversation).where(Conversation.client_id.in_(ids)))
    ).all()
    by_client = {item.client_id: item for item in conversations}
    conv_ids = [item.id for item in conversations]
    previews: dict[uuid.UUID, Message] = {}
    if conv_ids:
        rank = func.row_number().over(
            partition_by=Message.conversation_id,
            order_by=(Message.created_at.desc(), Message.id.desc()),
        ).label("rn")
        ranked = select(Message.id, rank).where(Message.conversation_id.in_(conv_ids)).subquery()
        rows = (
            await session.scalars(
                select(Message).join(ranked, ranked.c.id == Message.id).where(ranked.c.rn == 1)
            )
        ).all()
        previews = {row.conversation_id: row for row in rows}
    seen_rows = (
        await session.execute(
            select(AuthSession.user_id, func.max(AuthSession.last_seen_at)).where(AuthSession.user_id.in_(ids)).group_by(AuthSession.user_id)
        )
    ).all()
    seen = {user_id: _iso(moment) for user_id, moment in seen_rows}
    result = []
    for client in clients:
        conversation = by_client.get(client.id)
        preview = previews.get(conversation.id) if conversation else None
        result.append(
            {
                "id": str(client.id),
                "login": client.login,
                "display_name": client.display_name,
                "status": client.status,
                "note": client.note,
                "created_at": _iso(client.created_at),
                "conversation_id": str(conversation.id) if conversation else None,
                "last_seen_at": seen.get(client.id),
                "preview": _preview(preview),
            }
        )
    return result


async def create_client(session: AsyncSession, actor: User, payload: AccountCreate) -> dict:
    login = payload.login.strip()
    if await _login_taken(session, login):
        raise AppError(409, "login_taken")
    now = utcnow()
    client = User(
        login=login,
        role="client",
        password_hash=hash_password(payload.password),
        display_name=payload.display_name.strip(),
        status="active",
        note=(payload.note or "").strip() or None,
        created_at=now,
    )
    session.add(client)
    await session.flush()
    session.add(UserSettings(user_id=client.id, theme="light", notifications_enabled=False))
    conversation = Conversation(client_id=client.id, created_at=now)
    session.add(conversation)
    await session.flush()
    await record(session, actor.id, "account.create", client.id)
    return {
        "id": str(client.id),
        "login": client.login,
        "display_name": client.display_name,
        "conversation_id": str(conversation.id),
    }


async def update_client(session: AsyncSession, actor: User, account_id: uuid.UUID, payload: AccountUpdate) -> dict:
    client = await _client_or_404(session, account_id)
    if payload.login is not None:
        login = payload.login.strip()
        if await _login_taken(session, login, client.id):
            raise AppError(409, "login_taken")
        client.login = login
    if payload.display_name is not None:
        client.display_name = payload.display_name.strip()
    if payload.note is not None:
        client.note = payload.note.strip() or None
    await record(session, actor.id, "account.update", client.id)
    return {"id": str(client.id), "login": client.login, "display_name": client.display_name}


async def set_client_password(session: AsyncSession, actor: User, account_id: uuid.UUID, password: str) -> None:
    client = await _client_or_404(session, account_id)
    client.password_hash = hash_password(password)
    await revoke_all(session, client.id)
    await record(session, actor.id, "account.password", client.id)


async def revoke_client_sessions(session: AsyncSession, actor: User, account_id: uuid.UUID) -> None:
    client = await _client_or_404(session, account_id)
    await revoke_all(session, client.id)
    await record(session, actor.id, "account.revoke_sessions", client.id)


async def set_blocked(session: AsyncSession, actor: User, account_id: uuid.UUID, blocked: bool) -> None:
    client = await _client_or_404(session, account_id)
    client.status = "blocked" if blocked else "active"
    if blocked:
        await revoke_all(session, client.id)
    await record(session, actor.id, "account.block" if blocked else "account.unblock", client.id)


async def delete_client(session: AsyncSession, actor: User, account_id: uuid.UUID) -> list[str]:
    client = await _client_or_404(session, account_id)
    conversation = await session.scalar(select(Conversation).where(Conversation.client_id == client.id))
    paths: list[str] = []
    if conversation is not None:
        messages = (await session.scalars(select(Message).where(Message.conversation_id == conversation.id))).all()
        attachment_ids = [item.attachment_id for item in messages if item.attachment_id]
        if attachment_ids:
            attachments = (await session.scalars(select(Attachment).where(Attachment.id.in_(attachment_ids)))).all()
            paths = [item.stored_name for item in attachments]
        message_ids = [item.id for item in messages]
        if message_ids:
            await session.execute(delete(MessageRevision).where(MessageRevision.message_id.in_(message_ids)))
            await session.execute(
                update(Message)
                .where(Message.conversation_id == conversation.id)
                .values(reply_to_id=None, attachment_id=None)
            )
            await session.execute(delete(Message).where(Message.conversation_id == conversation.id))
        if attachment_ids:
            await session.execute(delete(Attachment).where(Attachment.id.in_(attachment_ids)))
        await session.delete(conversation)
    await session.execute(delete(AuthSession).where(AuthSession.user_id == client.id))
    settings = await session.get(UserSettings, client.id)
    if settings is not None:
        await session.delete(settings)
    await record(session, actor.id, "account.delete", client.id)
    await session.delete(client)
    return paths
