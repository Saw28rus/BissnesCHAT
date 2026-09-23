from uuid import UUID

from pydantic import BaseModel, Field


class ConnectIn(BaseModel):
    shop_id: str = Field(min_length=1, max_length=32, pattern=r"^[0-9A-Za-z]+$")
    secret_key: str = Field(min_length=16, max_length=256)


class InvoiceIn(BaseModel):
    amount: str = Field(min_length=1, max_length=20)
    description: str | None = Field(default=None, max_length=128)
    period: str | None = Field(default=None, max_length=64)
    template_id: UUID | None = None
    days: int = Field(default=7, ge=1, le=30)
    client_nonce: UUID | None = None


class InvoiceCreateIn(InvoiceIn):
    conversation_id: UUID
