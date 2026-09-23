import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import AppError
from app.core.rate_limit import message_limiter
from app.core.security import utcnow
from app.modules.accounts.models import User
from app.modules.audit.service import record
from app.modules.conversations.models import Conversation, Message
from app.modules.conversations.present import present_message


async def send_broadcast(
    session: AsyncSession,
    actor: User,
    body: str,
    account_ids: list[uuid.UUID],
) -> tuple[int, int, list[tuple[uuid.UUID, dict]]]:
    if not message_limiter.allow(f"broadcast:{actor.id}", 3, 60):
        raise AppError(429, "rate_limited")
    text = body.strip()
    if not text or len(text) > 4000:
        raise AppError(400, "validation")
    unique: list[uuid.UUID] = []
    seen: set[uuid.UUID] = set()
    for item in account_ids:
        if item in seen:
            continue
        seen.add(item)
        unique.append(item)
    if not unique:
        raise AppError(400, "validation")
    sent = 0
    skipped = 0
    delivered: list[tuple[uuid.UUID, dict]] = []
    now = utcnow()
    for account_id in unique:
        client = await session.get(User, account_id)
        if client is None or client.role != "client" or client.status != "active":
            skipped += 1
            continue
        conversation = await session.scalar(select(Conversation).where(Conversation.client_id == client.id))
        if conversation is None:
            skipped += 1
            continue
        message = Message(
            conversation_id=conversation.id,
            sender_id=actor.id,
            type="text",
            body=text,
            created_at=now,
            updated_at=now,
        )
        session.add(message)
        await session.flush()
        delivered.append((client.id, present_message(message)))
        sent += 1
    await record(session, actor.id, "broadcast.send")
    return sent, skipped, delivered
