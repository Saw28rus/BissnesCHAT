from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.core.deps import require_admin
from app.modules.audit.service import list_recent

router = APIRouter(prefix="/audit", tags=["audit"])


@router.get("")
async def get_audit(request: Request, session: AsyncSession = Depends(get_session)) -> list[dict]:
    await require_admin(request, session)
    return await list_recent(session)
