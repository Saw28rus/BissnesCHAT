import time
import uuid
from dataclasses import dataclass

from app.core.errors import AppError


@dataclass
class PreviewDraft:
    admin_id: uuid.UUID
    session_id: uuid.UUID
    payload: dict
    expires_at: float


class PreviewStore:
    def __init__(self) -> None:
        self._items: dict[str, PreviewDraft] = {}

    def put(self, admin_id: uuid.UUID, session_id: uuid.UUID, payload: dict) -> str:
        self.purge()
        token = uuid.uuid4().hex
        self._items[token] = PreviewDraft(admin_id, session_id, payload, time.monotonic() + 600)
        return token

    def take(self, token: str, admin_id: uuid.UUID, session_id: uuid.UUID) -> dict:
        self.purge()
        draft = self._items.get(token)
        if draft is None or draft.admin_id != admin_id or draft.session_id != session_id:
            raise AppError(404, "not_found")
        if time.monotonic() > draft.expires_at:
            self._items.pop(token, None)
            raise AppError(404, "not_found")
        return draft.payload

    def drop(self, token: str) -> None:
        self._items.pop(token, None)

    def purge(self) -> None:
        now = time.monotonic()
        expired = [key for key, item in self._items.items() if item.expires_at <= now]
        for key in expired:
            self._items.pop(key, None)

    def clear(self) -> None:
        self._items.clear()


preview_store = PreviewStore()
