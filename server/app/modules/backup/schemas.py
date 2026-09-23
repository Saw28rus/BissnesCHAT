from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class BackupClient(BaseModel):
    id: UUID
    conversation_id: UUID
    login: str = Field(min_length=3, max_length=64)
    display_name: str = Field(min_length=1, max_length=120)
    password_hash: str = Field(min_length=10, max_length=400)
    status: str = Field(pattern="^(active|blocked)$")
    note: str | None = Field(default=None, max_length=2000)
    theme: str = Field(pattern="^(light|dark)$")
    notifications_enabled: bool


class BackupMessage(BaseModel):
    id: UUID
    conversation_id: UUID
    sender: str = Field(min_length=1, max_length=64)
    body: str = Field(max_length=4000)
    reply_to_id: UUID | None = None
    reply_quote: str | None = Field(default=None, max_length=200)
    created_at: datetime
    edited_at: datetime | None = None


class BackupFile(BaseModel):
    version: int
    exported_at: datetime
    clients: list[BackupClient] = Field(max_length=5000)
    messages: list[BackupMessage] = Field(default_factory=list, max_length=5000)


class RestoreIn(BaseModel):
    preview_id: str = Field(min_length=8, max_length=80)
