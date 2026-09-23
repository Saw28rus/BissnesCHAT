from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.core.deps import require_admin, require_csrf
from app.modules.accounts.schemas import AccountCreate, AccountPassword, AccountUpdate
from app.modules.accounts.service import (
    create_client,
    delete_client,
    list_clients,
    revoke_client_sessions,
    set_blocked,
    set_client_password,
    update_client,
)
from app.modules.attachments.storage import remove_stored
from app.realtime.hub import hub

router = APIRouter(prefix="/accounts", tags=["accounts"])


@router.get("")
async def get_accounts(
    request: Request,
    q: str = "",
    session: AsyncSession = Depends(get_session),
) -> list[dict]:
    await require_admin(request, session)
    return await list_clients(session, q)


@router.post("", status_code=201)
async def post_account(
    payload: AccountCreate,
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> dict:
    require_csrf(request)
    actor = await require_admin(request, session)
    created = await create_client(session, actor, payload)
    await hub.send_admins({"v": 1, "type": "client.updated", "account_id": created["id"]})
    return created


@router.patch("/{account_id}")
async def patch_account(
    account_id: UUID,
    payload: AccountUpdate,
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> dict:
    require_csrf(request)
    actor = await require_admin(request, session)
    updated = await update_client(session, actor, account_id, payload)
    await hub.send_admins({"v": 1, "type": "client.updated", "account_id": str(account_id)})
    return updated


@router.post("/{account_id}/password")
async def post_password(
    account_id: UUID,
    payload: AccountPassword,
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> dict:
    require_csrf(request)
    actor = await require_admin(request, session)
    await set_client_password(session, actor, account_id, payload.password)
    await hub.disconnect_user(account_id)
    return {"ok": True}


@router.post("/{account_id}/sessions/revoke")
async def post_revoke(
    account_id: UUID,
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> dict:
    require_csrf(request)
    actor = await require_admin(request, session)
    await revoke_client_sessions(session, actor, account_id)
    await hub.disconnect_user(account_id)
    return {"ok": True}


@router.post("/{account_id}/block")
async def post_block(account_id: UUID, request: Request, session: AsyncSession = Depends(get_session)) -> dict:
    require_csrf(request)
    actor = await require_admin(request, session)
    await set_blocked(session, actor, account_id, True)
    await hub.disconnect_user(account_id)
    await hub.send_admins({"v": 1, "type": "client.updated", "account_id": str(account_id)})
    return {"ok": True}


@router.post("/{account_id}/unblock")
async def post_unblock(account_id: UUID, request: Request, session: AsyncSession = Depends(get_session)) -> dict:
    require_csrf(request)
    actor = await require_admin(request, session)
    await set_blocked(session, actor, account_id, False)
    await hub.send_admins({"v": 1, "type": "client.updated", "account_id": str(account_id)})
    return {"ok": True}


@router.delete("/{account_id}")
async def remove_account(
    account_id: UUID,
    request: Request,
    background: BackgroundTasks,
    session: AsyncSession = Depends(get_session),
) -> Response:
    require_csrf(request)
    actor = await require_admin(request, session)
    paths = await delete_client(session, actor, account_id)
    background.add_task(remove_stored, paths)
    await hub.disconnect_user(account_id)
    await hub.send_admins({"v": 1, "type": "client.updated", "account_id": str(account_id)})
    return Response(status_code=204)
