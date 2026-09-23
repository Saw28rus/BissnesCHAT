from uuid import UUID

from fastapi import APIRouter, Depends, Request
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.core.deps import require_user
from app.core.errors import AppError
from app.modules.attachments.models import Attachment
from app.modules.attachments.storage import resolve_stored
from app.modules.conversations.access import get_conversation
from app.modules.conversations.models import Message

router = APIRouter(prefix="/attachments", tags=["attachments"])


@router.get("/{attachment_id}")
async def download(
    attachment_id: UUID,
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> FileResponse:
    user = await require_user(request, session)
    message = await session.scalar(
        select(Message).where(Message.attachment_id == attachment_id, Message.deleted_at.is_(None))
    )
    if message is None:
        raise AppError(404, "not_found")
    await get_conversation(session, user, message.conversation_id)
    attachment = await session.get(Attachment, attachment_id)
    if attachment is None or not attachment.stored_name:
        raise AppError(404, "not_found")
    path = resolve_stored(attachment.stored_name)
    inline = attachment.content_type.startswith("image/") or attachment.content_type.startswith("audio/")
    return FileResponse(
        path,
        media_type=attachment.content_type,
        filename=attachment.original_name,
        content_disposition_type="inline" if inline else "attachment",
    )
