from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.core.deps import require_admin, require_csrf
from app.modules.broadcast.schemas import BroadcastIn
from app.modules.broadcast.service import send_broadcast
from app.realtime.hub import hub

router = APIRouter(prefix="/broadcast", tags=["broadcast"])


@router.post("")
async def post_broadcast(
    payload: BroadcastIn,
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> dict:
    require_csrf(request)
    actor = await require_admin(request, session)
    sent, skipped, delivered = await send_broadcast(session, actor, payload.body, payload.account_ids)
    for client_id, message in delivered:
        await hub.broadcast_conversation(client_id, {"v": 1, "type": "message.created", "message": message})
    return {"sent": sent, "skipped": skipped}
