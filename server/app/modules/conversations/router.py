from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, Request, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.core.deps import require_csrf, require_user
from app.core.errors import AppError
from app.modules.attachments.storage import remove_stored
from app.modules.conversations.schemas import EditMessageIn, TextMessageIn
from app.modules.conversations.service import create_file, create_text, delete_message, edit_message, list_messages, sync_messages
from app.realtime.hub import hub

router = APIRouter(tags=["conversations"])


def _event(name: str, message: dict) -> dict:
    return {"v": 1, "type": name, "message": message}


@router.get("/conversations/{conversation_id}/messages")
async def get_messages(
    conversation_id: UUID,
    request: Request,
    cursor: str | None = None,
    session: AsyncSession = Depends(get_session),
) -> dict:
    user = await require_user(request, session)
    return await list_messages(session, user, conversation_id, cursor)


@router.get("/conversations/{conversation_id}/sync")
async def get_sync(
    conversation_id: UUID,
    request: Request,
    since: datetime,
    session: AsyncSession = Depends(get_session),
) -> dict:
    user = await require_user(request, session)
    return await sync_messages(session, user, conversation_id, since)


@router.post("/conversations/{conversation_id}/messages", status_code=201)
async def post_text(
    conversation_id: UUID,
    payload: TextMessageIn,
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> dict:
    require_csrf(request)
    user = await require_user(request, session)
    message, client_id = await create_text(
        session, user, conversation_id, payload.body, payload.client_nonce, payload.reply_to_id
    )
    await hub.broadcast_conversation(client_id, _event("message.created", message))
    return message


@router.post("/conversations/{conversation_id}/files", status_code=201)
async def post_file(
    conversation_id: UUID,
    request: Request,
    kind: str = Form(...),
    client_nonce: UUID | None = Form(default=None),
    reply_to_id: UUID | None = Form(default=None),
    duration_sec: int | None = Form(default=None),
    upload: UploadFile = File(...),
    session: AsyncSession = Depends(get_session),
) -> dict:
    require_csrf(request)
    user = await require_user(request, session)
    data = await upload.read(20 * 1024 * 1024 + 1)
    if len(data) > 20 * 1024 * 1024:
        raise AppError(413, "payload_too_large")
    message, client_id = await create_file(
        session,
        user,
        conversation_id,
        kind,
        upload.filename or "file",
        data,
        client_nonce,
        reply_to_id,
        duration_sec,
    )
    await hub.broadcast_conversation(client_id, _event("message.created", message))
    return message


@router.patch("/messages/{message_id}")
async def patch_message(
    message_id: UUID,
    payload: EditMessageIn,
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> dict:
    require_csrf(request)
    user = await require_user(request, session)
    message, client_id = await edit_message(session, user, message_id, payload.body)
    await hub.broadcast_conversation(client_id, _event("message.updated", message))
    return message


@router.delete("/messages/{message_id}")
async def remove_message(
    message_id: UUID,
    request: Request,
    background: BackgroundTasks,
    session: AsyncSession = Depends(get_session),
) -> dict:
    require_csrf(request)
    user = await require_user(request, session)
    messages, client_id, paths = await delete_message(session, user, message_id)
    if paths:
        background.add_task(remove_stored, paths)
    for index, message in enumerate(messages):
        name = "message.deleted" if index == 0 else "message.updated"
        await hub.broadcast_conversation(client_id, _event(name, message))
    return messages[0]
