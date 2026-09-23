from uuid import UUID

from pydantic import BaseModel, Field


class BroadcastIn(BaseModel):
    body: str = Field(min_length=1, max_length=4000)
    account_ids: list[UUID] = Field(min_length=1, max_length=200)
