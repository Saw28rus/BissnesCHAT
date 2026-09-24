import json
import uuid
from datetime import UTC, datetime, timedelta

from pydantic import ValidationError
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import AppError
from app.core.security import utcnow
from app.modules.accounts.models import ClientField, User, UserSettings
from app.modules.audit.service import record
from app.modules.backup.crypto import decrypt_backup, encrypt_backup
from app.modules.backup.models import BackupMeta
from app.modules.backup.schemas import BackupFile
from app.modules.backup.store import preview_store
from app.modules.conversations.models import Conversation, Message

_MAX_BLOB = 16 * 1024 * 1024


def _aware(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value


async def export_backup(
    session: AsyncSession,
    actor: User,
    password: str,
    include_messages: bool,
) -> bytes:
    if len(password) < 12 or len(password) > 128:
        raise AppError(400, "validation")
    now = utcnow()
    clients = (await session.scalars(select(User).where(User.role == "client").order_by(User.login))).all()
    client_ids = [item.id for item in clients]
    settings_rows = (
        await session.scalars(select(UserSettings).where(UserSettings.user_id.in_(client_ids)))
    ).all() if client_ids else []
    settings_by_user = {item.user_id: item for item in settings_rows}
    conversations = (
        await session.scalars(select(Conversation).where(Conversation.client_id.in_(client_ids)))
    ).all() if client_ids else []
    conversation_by_client = {item.client_id: item for item in conversations}
    field_rows = (
        await session.scalars(select(ClientField).where(ClientField.user_id.in_(client_ids)).order_by(ClientField.position, ClientField.id))
    ).all() if client_ids else []
    fields_by_user: dict[uuid.UUID, list[ClientField]] = {}
    for row in field_rows:
        fields_by_user.setdefault(row.user_id, []).append(row)
    payload_clients = []
    for client in clients:
        conversation = conversation_by_client.get(client.id)
        if conversation is None:
            continue
        settings = settings_by_user.get(client.id)
        payload_clients.append(
            {
                "id": str(client.id),
                "conversation_id": str(conversation.id),
                "login": client.login,
                "display_name": client.display_name,
                "password_hash": client.password_hash,
                "status": client.status,
                "note": client.note,
                "theme": settings.theme if settings else "light",
                "notifications_enabled": bool(settings.notifications_enabled) if settings else False,
                "phone": client.phone,
                "fields": [
                    {"label": row.label, "value": row.value}
                    for row in fields_by_user.get(client.id, [])
                ],
            }
        )
    messages_payload: list[dict] = []
    if include_messages and conversations:
        window_start = now - timedelta(hours=24)
        conv_ids = [item.id for item in conversations]
        rows = (
            await session.scalars(
                select(Message).where(
                    Message.conversation_id.in_(conv_ids),
                    Message.type == "text",
                    Message.deleted_at.is_(None),
                    Message.created_at >= window_start,
                    Message.created_at <= now,
                )
            )
        ).all()
        users = {item.id: item for item in clients}
        admin_ids = set(
            (await session.scalars(select(User.id).where(User.role == "admin"))).all()
        )
        for row in rows:
            if row.sender_id in admin_ids:
                sender = "admin"
            elif row.sender_id in users:
                sender = str(row.sender_id)
            else:
                continue
            messages_payload.append(
                {
                    "id": str(row.id),
                    "conversation_id": str(row.conversation_id),
                    "sender": sender,
                    "body": row.body,
                    "reply_to_id": str(row.reply_to_id) if row.reply_to_id else None,
                    "reply_quote": row.reply_quote,
                    "created_at": _aware(row.created_at).isoformat(),
                    "edited_at": _aware(row.edited_at).isoformat() if row.edited_at else None,
                }
            )
    document = {
        "version": 1,
        "exported_at": now.isoformat(),
        "clients": payload_clients,
        "messages": messages_payload,
    }
    raw = json.dumps(document, ensure_ascii=False).encode("utf-8")
    if len(raw) > _MAX_BLOB:
        raise AppError(413, "payload_too_large")
    meta = await session.get(BackupMeta, 1)
    if meta is None:
        meta = BackupMeta(id=1, last_export_at=now)
        session.add(meta)
    else:
        meta.last_export_at = now
    await record(session, actor.id, "backup.export", None)
    return encrypt_backup(password, raw)


def parse_backup(password: str, blob: bytes) -> BackupFile:
    if len(blob) > _MAX_BLOB:
        raise AppError(413, "payload_too_large")
    raw = decrypt_backup(password, blob)
    if len(raw) > _MAX_BLOB:
        raise AppError(413, "payload_too_large")
    try:
        data = json.loads(raw)
        parsed = BackupFile.model_validate(data)
    except (json.JSONDecodeError, ValidationError) as exc:
        raise AppError(400, "invalid_backup") from exc
    if parsed.version != 1:
        raise AppError(400, "invalid_backup")
    exported = _aware(parsed.exported_at)
    kept = []
    for message in parsed.messages:
        created = _aware(message.created_at)
        if created < exported - timedelta(hours=24, minutes=5):
            continue
        if created > exported + timedelta(minutes=5):
            continue
        kept.append(message)
    for client in parsed.clients:
        if not client.password_hash.startswith("$argon2"):
            raise AppError(400, "invalid_backup")
    parsed.messages = kept
    return parsed


async def build_preview(
    session: AsyncSession,
    actor: User,
    auth_session_id: uuid.UUID,
    password: str,
    blob: bytes,
) -> dict:
    parsed = parse_backup(password, blob)
    existing_ids = set((await session.scalars(select(User.id).where(User.role == "client"))).all())
    logins = {
        login: user_id
        for user_id, login in (
            await session.execute(select(User.id, func.lower(User.login)).where(User.role == "client"))
        ).all()
    }
    replaced = 0
    skipped = 0
    for client in parsed.clients:
        if client.id in existing_ids:
            replaced += 1
        elif client.login.casefold() in logins and logins[client.login.casefold()] != client.id:
            skipped += 1
    preview_id = preview_store.put(
        actor.id,
        auth_session_id,
        parsed.model_dump(mode="json"),
    )
    return {
        "preview_id": preview_id,
        "exported_at": _aware(parsed.exported_at).isoformat(),
        "clients": len(parsed.clients),
        "messages": len(parsed.messages),
        "passwords_replaced": replaced,
        "logins_skipped": skipped,
    }


async def restore_backup(
    session: AsyncSession,
    actor: User,
    auth_session_id: uuid.UUID,
    preview_id: str,
) -> dict:
    payload = preview_store.take(preview_id, actor.id, auth_session_id)
    parsed = BackupFile.model_validate(payload)
    admin = await session.scalar(select(User).where(User.role == "admin"))
    if admin is None:
        raise AppError(500, "server_error")
    created = 0
    updated = 0
    skipped = 0
    messages_inserted = 0
    imported_clients: dict[uuid.UUID, uuid.UUID] = {}
    skipped_conversations: set[uuid.UUID] = set()
    for client in parsed.clients:
        current = await session.get(User, client.id)
        login_owner = await session.scalar(select(User).where(func.lower(User.login) == client.login.casefold()))
        if current is None and login_owner is not None:
            skipped += 1
            skipped_conversations.add(client.conversation_id)
            continue
        if current is not None and current.role != "client":
            skipped += 1
            skipped_conversations.add(client.conversation_id)
            continue
        if current is None:
            current = User(
                id=client.id,
                login=client.login,
                role="client",
                password_hash=client.password_hash,
                display_name=client.display_name,
                phone=client.phone,
                status=client.status,
                note=client.note,
                created_at=utcnow(),
            )
            session.add(current)
            await session.flush()
            session.add(
                UserSettings(
                    user_id=current.id,
                    theme=client.theme,
                    notifications_enabled=client.notifications_enabled,
                )
            )
            session.add(Conversation(id=client.conversation_id, client_id=current.id, created_at=utcnow()))
            created += 1
        else:
            if login_owner is not None and login_owner.id != current.id:
                skipped += 1
                skipped_conversations.add(client.conversation_id)
                continue
            current.login = client.login
            current.password_hash = client.password_hash
            current.display_name = client.display_name
            current.phone = client.phone
            current.status = client.status
            current.note = client.note
            settings = await session.get(UserSettings, current.id)
            if settings is None:
                session.add(
                    UserSettings(
                        user_id=current.id,
                        theme=client.theme,
                        notifications_enabled=client.notifications_enabled,
                    )
                )
            else:
                settings.theme = client.theme
                settings.notifications_enabled = client.notifications_enabled
            conversation = await session.scalar(select(Conversation).where(Conversation.client_id == current.id))
            if conversation is None:
                conversation = Conversation(id=client.conversation_id, client_id=current.id, created_at=utcnow())
                session.add(conversation)
            updated += 1
        await session.execute(delete(ClientField).where(ClientField.user_id == current.id))
        for index, item in enumerate(client.fields):
            session.add(ClientField(user_id=current.id, label=item.label, value=item.value, position=index))
        conversation = await session.scalar(select(Conversation).where(Conversation.client_id == current.id))
        imported_clients[client.id] = conversation.id if conversation else client.conversation_id
    await session.flush()
    ordered = sorted(parsed.messages, key=lambda item: _aware(item.created_at))
    known_ids = set(
        (await session.scalars(select(Message.id).where(Message.id.in_([item.id for item in ordered])))).all()
    ) if ordered else set()
    pending: list[Message] = []
    for item in ordered:
        if item.conversation_id in skipped_conversations:
            continue
        target_conversation = None
        for client_id, conversation_id in imported_clients.items():
            source = next((row for row in parsed.clients if row.id == client_id), None)
            if source and source.conversation_id == item.conversation_id:
                target_conversation = conversation_id
                break
        if target_conversation is None:
            continue
        if item.id in known_ids:
            continue
        if item.sender == "admin":
            sender_id = admin.id
        else:
            try:
                sender_uuid = uuid.UUID(item.sender)
            except ValueError:
                continue
            if sender_uuid not in imported_clients:
                continue
            sender_id = sender_uuid
        created_at = _aware(item.created_at)
        message = Message(
            id=item.id,
            conversation_id=target_conversation,
            sender_id=sender_id,
            type="text",
            body=item.body,
            reply_to_id=None,
            reply_quote=item.reply_quote,
            created_at=created_at,
            edited_at=_aware(item.edited_at) if item.edited_at else None,
            updated_at=created_at,
        )
        session.add(message)
        pending.append(message)
        known_ids.add(item.id)
        messages_inserted += 1
    await session.flush()
    existing_after = set(known_ids)
    for message, source in zip(pending, [item for item in ordered if item.id in {row.id for row in pending}], strict=False):
        if source.reply_to_id and source.reply_to_id in existing_after:
            message.reply_to_id = source.reply_to_id
    preview_store.drop(preview_id)
    await record(session, actor.id, "backup.restore", None)
    return {
        "created": created,
        "updated": updated,
        "skipped": skipped,
        "messages": messages_inserted,
    }


async def status(session: AsyncSession) -> dict:
    from app.modules.attachments.storage import disk_report

    meta = await session.get(BackupMeta, 1)
    last = meta.last_export_at if meta else None
    reminder = last is None or _aware(last) < utcnow() - timedelta(days=7)
    report = disk_report()
    report["last_export_at"] = _aware(last).isoformat() if last else None
    report["reminder"] = reminder
    return report

