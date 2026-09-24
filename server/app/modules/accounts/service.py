import uuid
from datetime import UTC, datetime

from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import AppError
from app.core.security import hash_password, utcnow
from app.modules.accounts.models import ClientField, User, UserSettings
from app.modules.accounts.schemas import AccountCreate, AccountUpdate, ClientParam
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
    if message.type == "invoice":
        return "Счёт"
    text = message.body.strip()
    return text[:80]


def _clean_opt(value: str | None, limit: int) -> str | None:
    if value is None:
        return None
    text = value.strip()
    return text[:limit] or None


_INN_LABELS = {"инн", "inn"}
_EDO_LABELS = {"эдо", "edo", "номер эдо"}


def _card(
    client: User,
    conversation_id: str | None,
    last_seen: str | None,
    preview: str | None,
    last_message_at: str | None,
    fields: list[dict] | None = None,
) -> dict:
    return {
        "id": str(client.id),
        "login": client.login,
        "display_name": client.display_name,
        "phone": client.phone,
        "inn": client.inn,
        "edo_id": client.edo_id,
        "status": client.status,
        "note": client.note,
        "created_at": _iso(client.created_at),
        "conversation_id": conversation_id,
        "last_seen_at": last_seen,
        "last_message_at": last_message_at,
        "preview": preview,
        "fields": fields or [],
    }


def _present_fields(client: User, rows: list[ClientField]) -> list[dict]:
    if rows:
        return [{"id": str(row.id), "label": row.label, "value": row.value} for row in rows]
    extra: list[dict] = []
    if client.edo_id:
        extra.append({"id": "legacy-edo", "label": "ЭДО", "value": client.edo_id})
    if client.inn:
        extra.append({"id": "legacy-inn", "label": "ИНН", "value": client.inn})
    return extra


def _sync_legacy(client: User, items: list[ClientParam]) -> None:
    inn = None
    edo = None
    for item in items:
        key = item.label.strip().casefold()
        if key in _INN_LABELS:
            inn = _clean_opt(item.value, 12)
        if key in _EDO_LABELS:
            edo = _clean_opt(item.value, 64)
    client.inn = inn
    client.edo_id = edo


async def _load_fields(session: AsyncSession, user_ids: list[uuid.UUID]) -> dict[uuid.UUID, list[ClientField]]:
    grouped: dict[uuid.UUID, list[ClientField]] = {user_id: [] for user_id in user_ids}
    if not user_ids:
        return grouped
    rows = (
        await session.scalars(
            select(ClientField).where(ClientField.user_id.in_(user_ids)).order_by(ClientField.position, ClientField.id)
        )
    ).all()
    for row in rows:
        grouped.setdefault(row.user_id, []).append(row)
    return grouped


async def _replace_fields(session: AsyncSession, client: User, items: list[ClientParam]) -> list[ClientField]:
    await session.execute(delete(ClientField).where(ClientField.user_id == client.id))
    rows: list[ClientField] = []
    for index, item in enumerate(items):
        label = item.label.strip()[:40]
        if not label:
            continue
        row = ClientField(
            user_id=client.id,
            label=label,
            value=(item.value or "").strip()[:200],
            position=index,
        )
        session.add(row)
        rows.append(row)
    _sync_legacy(client, [ClientParam(label=row.label, value=row.value) for row in rows])
    await session.flush()
    return rows


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
            func.lower(User.display_name).like(needle)
            | func.lower(User.login).like(needle)
            | func.lower(func.coalesce(User.phone, "")).like(needle)
            | func.lower(func.coalesce(User.inn, "")).like(needle)
            | func.lower(func.coalesce(User.edo_id, "")).like(needle)
            | User.id.in_(
                select(ClientField.user_id).where(
                    func.lower(ClientField.label).like(needle) | func.lower(ClientField.value).like(needle)
                )
            )
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
    fields_by_user = await _load_fields(session, ids)
    result = []
    for client in clients:
        conversation = by_client.get(client.id)
        preview = previews.get(conversation.id) if conversation else None
        result.append(
            _card(
                client,
                str(conversation.id) if conversation else None,
                seen.get(client.id),
                _preview(preview),
                _iso(preview.created_at) if preview else None,
                _present_fields(client, fields_by_user.get(client.id, [])),
            )
        )
    return result


async def get_client_card(session: AsyncSession, account_id: uuid.UUID) -> dict:
    client = await _client_or_404(session, account_id)
    conversation = await session.scalar(select(Conversation).where(Conversation.client_id == client.id))
    preview_row = None
    if conversation is not None:
        preview_row = await session.scalar(
            select(Message)
            .where(Message.conversation_id == conversation.id)
            .order_by(Message.created_at.desc(), Message.id.desc())
            .limit(1)
        )
    last_seen = await session.scalar(select(func.max(AuthSession.last_seen_at)).where(AuthSession.user_id == client.id))
    fields = await _load_fields(session, [client.id])
    return _card(
        client,
        str(conversation.id) if conversation else None,
        _iso(last_seen),
        _preview(preview_row),
        _iso(preview_row.created_at) if preview_row else None,
        _present_fields(client, fields.get(client.id, [])),
    )


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
        phone=_clean_opt(payload.phone, 32),
        inn=_clean_opt(payload.inn, 12),
        edo_id=_clean_opt(payload.edo_id, 64),
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
    params = list(payload.fields)
    if not params:
        if payload.edo_id:
            params.append(ClientParam(label="ЭДО", value=payload.edo_id))
        if payload.inn:
            params.append(ClientParam(label="ИНН", value=payload.inn))
    if params:
        await _replace_fields(session, client, params)
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
    if payload.phone is not None:
        client.phone = _clean_opt(payload.phone, 32)
    if payload.inn is not None:
        client.inn = _clean_opt(payload.inn, 12)
    if payload.edo_id is not None:
        client.edo_id = _clean_opt(payload.edo_id, 64)
    if payload.note is not None:
        client.note = payload.note.strip() or None
    if payload.fields is not None:
        await _replace_fields(session, client, payload.fields)
    else:
        if payload.inn is not None:
            client.inn = _clean_opt(payload.inn, 12)
        if payload.edo_id is not None:
            client.edo_id = _clean_opt(payload.edo_id, 64)
        if payload.inn is not None or payload.edo_id is not None:
            current = (await _load_fields(session, [client.id])).get(client.id, [])
            if current:
                params = [ClientParam(label=row.label, value=row.value) for row in current]
                if payload.inn is not None:
                    params = [item for item in params if item.label.strip().casefold() not in _INN_LABELS]
                    if client.inn:
                        params.append(ClientParam(label="ИНН", value=client.inn))
                if payload.edo_id is not None:
                    params = [item for item in params if item.label.strip().casefold() not in _EDO_LABELS]
                    if client.edo_id:
                        params.append(ClientParam(label="ЭДО", value=client.edo_id))
                await _replace_fields(session, client, params)
    await record(session, actor.id, "account.update", client.id)
    fields = (await _load_fields(session, [client.id])).get(client.id, [])
    return {
        "id": str(client.id),
        "login": client.login,
        "display_name": client.display_name,
        "phone": client.phone,
        "inn": client.inn,
        "edo_id": client.edo_id,
        "fields": _present_fields(client, fields),
    }


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
    await session.execute(delete(ClientField).where(ClientField.user_id == client.id))
    settings = await session.get(UserSettings, client.id)
    if settings is not None:
        await session.delete(settings)
    await record(session, actor.id, "account.delete", client.id)
    await session.delete(client)
    return paths
