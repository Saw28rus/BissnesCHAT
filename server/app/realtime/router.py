from fastapi import APIRouter, WebSocket

from app.core.config import get_settings
from app.core.db import get_sessionmaker
from app.core.security import hash_token, session_deadline, utcnow
from app.modules.accounts.models import User
from app.modules.auth.models import AuthSession
from app.realtime.hub import hub
from sqlalchemy import select

router = APIRouter()

_MAX_FRAME = 64 * 1024


@router.websocket("/ws")
async def socket(websocket: WebSocket) -> None:
    settings = get_settings()
    origin = websocket.headers.get("origin", "")
    if origin not in settings.allowed_origins:
        await websocket.close(code=1008)
        return
    await websocket.accept()
    token = websocket.cookies.get(settings.session_cookie, "")
    async with get_sessionmaker()() as session:
        user = await _user_from_token(session, token)
        if user is not None:
            auth = await session.scalar(select(AuthSession).where(AuthSession.token_hash == hash_token(token)))
            if auth is not None:
                auth.last_seen_at = utcnow()
            await session.commit()
    if user is None:
        await websocket.close(code=1008)
        return
    await hub.register(user, websocket)
    try:
        while True:
            incoming = await websocket.receive()
            if incoming["type"] == "websocket.disconnect":
                break
            text = incoming.get("text") or ""
            raw = incoming.get("bytes") or b""
            if len(text) > _MAX_FRAME or len(raw) > _MAX_FRAME:
                await websocket.close(code=1009)
                break
            if text == "ping":
                await websocket.send_json({"v": 1, "type": "pong"})
    finally:
        await hub.unregister(user, websocket)


async def _user_from_token(session, token: str) -> User | None:
    if not token:
        return None
    auth = await session.scalar(select(AuthSession).where(AuthSession.token_hash == hash_token(token)))
    if auth is None or auth.revoked_at is not None:
        return None
    created = auth.created_at
    from datetime import UTC

    if created.tzinfo is None:
        created = created.replace(tzinfo=UTC)
    if utcnow() >= session_deadline(created):
        return None
    user = await session.get(User, auth.user_id)
    if user is None or user.status != "active":
        return None
    return user
