import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import AppError
from app.modules.accounts.models import User
from app.modules.conversations.models import Conversation


async def get_conversation(
    session: AsyncSession,
    user: User,
    conversation_id: uuid.UUID,
) -> Conversation:
    conversation = await session.get(Conversation, conversation_id)
    if conversation is None:
        raise AppError(404, "not_found")
    if user.role == "admin":
        return conversation
    if user.role == "client" and conversation.client_id == user.id:
        return conversation
    raise AppError(404, "not_found")
