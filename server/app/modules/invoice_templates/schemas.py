from uuid import UUID

from pydantic import BaseModel, Field

DEFAULT_BODY = (
    "Здравствуйте, {name}! Счёт за {period} на сумму {amount} готов. "
    "Ссылка для оплаты: {url}\n\n"
    "Счёт действителен до: {expires}"
)


class TemplateIn(BaseModel):
    title: str = Field(min_length=1, max_length=80)
    body: str = Field(min_length=1, max_length=4000)


class TemplatePatch(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=80)
    body: str | None = Field(default=None, min_length=1, max_length=4000)
