from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.core.deps import require_admin, require_csrf
from app.core.errors import AppError
from app.core.rate_limit import update_limiter
from app.modules.audit.service import record
from app.modules.updates.schemas import UpdateStatus
from app.modules.updates import service

router = APIRouter(tags=["updates"])


@router.get("/updates")
async def get_status(request: Request, session: AsyncSession = Depends(get_session)) -> UpdateStatus:
    await require_admin(request, session)
    return await service.status()


@router.post("/updates/apply")
async def post_apply(request: Request, session: AsyncSession = Depends(get_session)) -> dict:
    require_csrf(request)
    actor = await require_admin(request, session)
    if not update_limiter.allow(str(actor.id), 3, 10 * 60):
        raise AppError(429, "rate_limited")
    snapshot = await service.status()
    service.request_update(snapshot.available)
    await record(session, actor.id, "update.apply")
    return {"ok": True, "current": snapshot.current, "latest": snapshot.latest}
