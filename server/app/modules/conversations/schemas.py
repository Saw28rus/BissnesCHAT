from uuid import UUID

from pydantic import BaseModel, Field


class TextMessageIn(BaseModel):
    body: str = Field(min_length=1, max_length=4000)
    client_nonce: UUID | None = None
    reply_to_id: UUID | None = None


class EditMessageIn(BaseModel):
    body: str = Field(min_length=1, max_length=4000)
