import asyncio
from uuid import UUID

from fastapi import WebSocket

from app.modules.accounts.models import User


class Hub:
    def __init__(self) -> None:
        self._users: dict[UUID, set[WebSocket]] = {}
        self._admins: set[WebSocket] = set()
        self._lock = asyncio.Lock()

    async def register(self, user: User, socket: WebSocket) -> None:
        async with self._lock:
            self._users.setdefault(user.id, set()).add(socket)
            if user.role == "admin":
                self._admins.add(socket)

    async def unregister(self, user: User, socket: WebSocket) -> None:
        async with self._lock:
            sockets = self._users.get(user.id)
            if sockets is not None:
                sockets.discard(socket)
                if not sockets:
                    self._users.pop(user.id, None)
            self._admins.discard(socket)

    async def send_user(self, user_id: UUID, event: dict) -> None:
        async with self._lock:
            sockets = list(self._users.get(user_id, ()))
        await self._send(sockets, event)

    async def send_admins(self, event: dict) -> None:
        async with self._lock:
            sockets = list(self._admins)
        await self._send(sockets, event)

    async def broadcast_conversation(self, client_user_id: UUID, event: dict) -> None:
        await self.send_user(client_user_id, event)
        await self.send_admins(event)

    async def disconnect_user(self, user_id: UUID) -> None:
        async with self._lock:
            sockets = list(self._users.get(user_id, ()))
        for socket in sockets:
            try:
                await socket.close(code=1008)
            except Exception:
                continue

    async def _send(self, sockets: list[WebSocket], event: dict) -> None:
        for socket in sockets:
            try:
                await socket.send_json(event)
            except Exception:
                continue


hub = Hub()
