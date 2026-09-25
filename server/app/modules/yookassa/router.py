from uuid import UUID

from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.core.deps import client_ip, require_admin, require_csrf
from app.modules.yookassa.schemas import ConnectIn, InvoiceCreateIn, InvoiceIn
from app.modules.yookassa.service import (
    connect,
    create_invoice,
    disconnect,
    handle_notification,
    hide_invoice,
    list_invoices,
    load_settings,
    present_settings,
)
from app.realtime.hub import hub

router = APIRouter(tags=["yookassa"])


@router.get("/yookassa")
async def get_yookassa(request: Request, session: AsyncSession = Depends(get_session)) -> dict:
    await require_admin(request, session)
    return present_settings(await load_settings(session))


@router.post("/yookassa/connect")
async def post_connect(
    payload: ConnectIn,
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> dict:
    require_csrf(request)
    actor = await require_admin(request, session)
    return await connect(session, actor, payload.shop_id, payload.secret_key)


@router.post("/yookassa/disconnect")
async def post_disconnect(request: Request, session: AsyncSession = Depends(get_session)) -> dict:
    require_csrf(request)
    actor = await require_admin(request, session)
    return await disconnect(session, actor)


async def _send_invoice(
    session: AsyncSession,
    user,
    conversation_id: UUID,
    payload: InvoiceIn,
) -> dict:
    message, client_id = await create_invoice(
        session,
        user,
        conversation_id,
        payload.amount,
        payload.description,
        payload.client_nonce,
        period=payload.period,
        template_id=payload.template_id,
        days=payload.days,
    )
    await hub.broadcast_conversation(client_id, {"v": 1, "type": "message.created", "message": message})
    return message


@router.post("/conversations/{conversation_id}/invoices", status_code=201)
async def post_invoice(
    conversation_id: UUID,
    payload: InvoiceIn,
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> dict:
    require_csrf(request)
    user = await require_admin(request, session)
    return await _send_invoice(session, user, conversation_id, payload)


@router.post("/invoices", status_code=201)
async def post_invoice_from_list(
    payload: InvoiceCreateIn,
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> dict:
    require_csrf(request)
    user = await require_admin(request, session)
    return await _send_invoice(session, user, payload.conversation_id, payload)


@router.get("/invoices")
async def get_invoices(
    request: Request,
    bucket: str = "issued",
    session: AsyncSession = Depends(get_session),
) -> dict:
    await require_admin(request, session)
    return await list_invoices(session, bucket)


@router.delete("/invoices/{invoice_id}")
async def remove_invoice(
    invoice_id: UUID,
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> dict:
    require_csrf(request)
    actor = await require_admin(request, session)
    return await hide_invoice(session, actor, invoice_id)


@router.post("/yookassa/notifications")
async def post_notification(request: Request, session: AsyncSession = Depends(get_session)) -> dict:
    try:
        payload = await request.json()
    except Exception:
        return {"ok": True}
    if not isinstance(payload, dict):
        return {"ok": True}
    message = await handle_notification(session, payload, client_ip(request))
    if message and message.get("conversation_id"):
        from app.modules.conversations.models import Conversation

        conversation = await session.get(Conversation, UUID(message["conversation_id"]))
        if conversation is not None:
            await hub.broadcast_conversation(
                conversation.client_id,
                {"v": 1, "type": "message.updated", "message": message},
            )
    return {"ok": True}
