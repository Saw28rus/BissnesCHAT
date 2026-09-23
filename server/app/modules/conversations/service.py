import base64
import json
import uuid
from datetime import UTC, datetime

from sqlalchemy import and_, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import AppError
from app.core.rate_limit import message_limiter, upload_limiter
from app.core.security import utcnow
from app.modules.accounts.models import User
from app.modules.attachments.inspect import clean_filename, sniff
from app.modules.attachments.models import Attachment
from app.modules.attachments.storage import ensure_space, write_bytes
from app.modules.conversations.access import get_conversation
from app.modules.conversations.models import Conversation, Message, MessageRevision
from app.modules.conversations.present import iso, present_message
from app.modules.yookassa.models import Invoice
from app.modules.yookassa.service import invoice_map, present_invoice, refresh_pending

_PAGE = 50


def encode_cursor(message: Message) -> str:
    raw = json.dumps({"t": iso(message.created_at), "id": str(message.id)}).encode()
    return base64.urlsafe_b64encode(raw).decode()


def decode_cursor(value: str) -> tuple[datetime, uuid.UUID]:
    try:
        payload = json.loads(base64.urlsafe_b64decode(value.encode()).decode())
        moment = datetime.fromisoformat(payload["t"])
        if moment.tzinfo is None:
            moment = moment.replace(tzinfo=UTC)
        return moment, uuid.UUID(payload["id"])
    except (KeyError, ValueError, json.JSONDecodeError):
        raise AppError(400, "validation") from None


async def attachment_map(session: AsyncSession, messages: list[Message]) -> dict[uuid.UUID, Attachment]:
    ids = [item.attachment_id for item in messages if item.attachment_id and item.deleted_at is None]
    if not ids:
        return {}
    rows = (await session.scalars(select(Attachment).where(Attachment.id.in_(ids)))).all()
    return {row.id: row for row in rows}


def present_many(
    messages: list[Message],
    attachments: dict[uuid.UUID, Attachment],
    invoices: dict[uuid.UUID, Invoice] | None = None,
) -> list[dict]:
    mapping = invoices or {}
    return [
        present_message(
            item,
            attachments.get(item.attachment_id) if item.attachment_id else None,
            present_invoice(mapping.get(item.id), item.deleted_at is not None),
        )
        for item in messages
    ]


async def list_messages(
    session: AsyncSession,
    user: User,
    conversation_id: uuid.UUID,
    cursor: str | None,
) -> dict:
    await get_conversation(session, user, conversation_id)
    stmt = select(Message).where(Message.conversation_id == conversation_id)
    if cursor:
        moment, message_id = decode_cursor(cursor)
        stmt = stmt.where(
            or_(
                Message.created_at < moment,
                and_(Message.created_at == moment, Message.id < message_id),
            )
        )
    rows = (
        await session.scalars(stmt.order_by(Message.created_at.desc(), Message.id.desc()).limit(_PAGE))
    ).all()
    ordered = list(reversed(rows))
    await refresh_pending(session, ordered)
    attachments = await attachment_map(session, ordered)
    invoices = await invoice_map(session, ordered)
    next_cursor = encode_cursor(rows[-1]) if len(rows) == _PAGE else None
    return {"messages": present_many(ordered, attachments, invoices), "next_cursor": next_cursor}


async def sync_messages(
    session: AsyncSession,
    user: User,
    conversation_id: uuid.UUID,
    since: datetime,
) -> dict:
    await get_conversation(session, user, conversation_id)
    if since.tzinfo is None:
        since = since.replace(tzinfo=UTC)
    rows = (
        await session.scalars(
            select(Message)
            .where(Message.conversation_id == conversation_id, Message.updated_at >= since)
            .order_by(Message.updated_at.asc())
            .limit(200)
        )
    ).all()
    listed = list(rows)
    await refresh_pending(session, listed)
    attachments = await attachment_map(session, listed)
    invoices = await invoice_map(session, listed)
    return {"messages": present_many(listed, attachments, invoices)}


async def create_text(
    session: AsyncSession,
    user: User,
    conversation_id: uuid.UUID,
    body: str,
    client_nonce: uuid.UUID | None,
    reply_to_id: uuid.UUID | None,
) -> tuple[dict, uuid.UUID]:
    if not message_limiter.allow(str(user.id), 40, 60):
        raise AppError(429, "rate_limited")
    conversation = await get_conversation(session, user, conversation_id)
    text = body.strip()
    if not text or len(text) > 4000:
        raise AppError(400, "validation")
    existing = await _existing_nonce(session, conversation_id, client_nonce)
    if existing is not None:
        return await _present_one(session, existing), conversation.client_id
    quote, reply_id = await _quote(session, conversation_id, reply_to_id)
    now = utcnow()
    message = Message(
        conversation_id=conversation.id,
        sender_id=user.id,
        type="text",
        body=text,
        reply_to_id=reply_id,
        reply_quote=quote,
        client_nonce=client_nonce,
        created_at=now,
        updated_at=now,
    )
    message = await _add_message(session, message)
    return await _present_one(session, message), conversation.client_id


async def create_file(
    session: AsyncSession,
    user: User,
    conversation_id: uuid.UUID,
    kind: str,
    filename: str,
    data: bytes,
    client_nonce: uuid.UUID | None,
    reply_to_id: uuid.UUID | None,
    duration_sec: int | None,
) -> tuple[dict, uuid.UUID]:
    if kind not in {"file", "voice"}:
        raise AppError(400, "validation")
    if not upload_limiter.allow(str(user.id), 15, 60):
        raise AppError(429, "rate_limited")
    if kind == "voice" and duration_sec is not None and (duration_sec < 0 or duration_sec > 180):
        raise AppError(400, "voice_too_long")
    conversation = await get_conversation(session, user, conversation_id)
    existing = await _existing_nonce(session, conversation_id, client_nonce)
    if existing is not None:
        return await _present_one(session, existing), conversation.client_id
    ensure_space()
    safe_name = clean_filename(filename)
    content_type, extension = sniff(data, safe_name, "voice" if kind == "voice" else "file")
    quote, reply_id = await _quote(session, conversation_id, reply_to_id)
    now = utcnow()
    attachment = Attachment(
        stored_name="",
        original_name=safe_name,
        content_type=content_type,
        size=len(data),
        duration_sec=duration_sec if kind == "voice" else None,
        created_at=now,
    )
    session.add(attachment)
    await session.flush()
    message = Message(
        conversation_id=conversation.id,
        sender_id=user.id,
        type=kind,
        body="",
        attachment_id=attachment.id,
        reply_to_id=reply_id,
        reply_quote=quote,
        client_nonce=client_nonce,
        created_at=now,
        updated_at=now,
    )
    message = await _add_message(session, message)
    attachment.stored_name = write_bytes(data, extension)
    return await _present_one(session, message), conversation.client_id


async def edit_message(
    session: AsyncSession,
    user: User,
    message_id: uuid.UUID,
    body: str,
) -> tuple[dict, uuid.UUID]:
    message, conversation = await _own_message(session, user, message_id)
    if message.deleted_at is not None or message.type != "text":
        raise AppError(400, "validation")
    text = body.strip()
    if not text or len(text) > 4000:
        raise AppError(400, "validation")
    if text == message.body:
        return await _present_one(session, message), conversation.client_id
    now = utcnow()
    session.add(MessageRevision(message_id=message.id, body=message.body, created_at=now))
    message.body = text
    message.edited_at = now
    message.updated_at = now
    return await _present_one(session, message), conversation.client_id


async def delete_message(
    session: AsyncSession,
    user: User,
    message_id: uuid.UUID,
) -> tuple[list[dict], uuid.UUID, list[str]]:
    message, conversation = await _own_message(session, user, message_id)
    if message.deleted_at is not None:
        return [await _present_one(session, message)], conversation.client_id, []
    now = utcnow()
    stored: list[str] = []
    if message.attachment_id is not None:
        attachment = await session.get(Attachment, message.attachment_id)
        if attachment is not None:
            stored.append(attachment.stored_name)
            await session.delete(attachment)
        message.attachment_id = None
    revisions = (
        await session.scalars(select(MessageRevision).where(MessageRevision.message_id == message.id))
    ).all()
    for revision in revisions:
        await session.delete(revision)
    message.body = ""
    message.deleted_at = now
    message.updated_at = now
    replies = (
        await session.scalars(select(Message).where(Message.reply_to_id == message.id))
    ).all()
    changed = [message]
    for reply in replies:
        if reply.reply_quote != "Сообщение удалено":
            reply.reply_quote = "Сообщение удалено"
            reply.updated_at = now
            changed.append(reply)
    payloads = [await _present_one(session, item) for item in changed]
    return payloads, conversation.client_id, [name for name in stored if name]


async def _own_message(session: AsyncSession, user: User, message_id: uuid.UUID) -> tuple[Message, Conversation]:
    message = await session.get(Message, message_id)
    if message is None:
        raise AppError(404, "not_found")
    conversation = await get_conversation(session, user, message.conversation_id)
    if message.sender_id != user.id:
        raise AppError(403, "forbidden")
    return message, conversation


async def _quote(
    session: AsyncSession,
    conversation_id: uuid.UUID,
    reply_to_id: uuid.UUID | None,
) -> tuple[str | None, uuid.UUID | None]:
    if reply_to_id is None:
        return None, None
    target = await session.get(Message, reply_to_id)
    if target is None or target.conversation_id != conversation_id:
        raise AppError(404, "not_found")
    if target.deleted_at is not None:
        return "Сообщение удалено", target.id
    if target.type == "file":
        return "Файл", target.id
    if target.type == "voice":
        return "Голосовое", target.id
    if target.type == "invoice":
        return "Счёт", target.id
    return target.body.strip()[:140], target.id


async def _existing_nonce(
    session: AsyncSession,
    conversation_id: uuid.UUID,
    client_nonce: uuid.UUID | None,
) -> Message | None:
    if client_nonce is None:
        return None
    return await session.scalar(
        select(Message).where(
            Message.conversation_id == conversation_id,
            Message.client_nonce == client_nonce,
        )
    )


async def _add_message(session: AsyncSession, message: Message) -> Message:
    try:
        async with session.begin_nested():
            session.add(message)
            await session.flush()
        return message
    except IntegrityError:
        if message in session:
            session.expunge(message)
        existing = await _existing_nonce(session, message.conversation_id, message.client_nonce)
        if existing is None:
            raise
        return existing


async def _present_one(session: AsyncSession, message: Message) -> dict:
    attachment = None
    if message.attachment_id is not None and message.deleted_at is None:
        attachment = await session.get(Attachment, message.attachment_id)
    invoices = await invoice_map(session, [message])
    return present_message(
        message,
        attachment,
        present_invoice(invoices.get(message.id), message.deleted_at is not None),
    )
