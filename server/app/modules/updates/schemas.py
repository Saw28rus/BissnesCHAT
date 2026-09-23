from pydantic import BaseModel


class UpdateStatus(BaseModel):
    current: str
    latest: str | None
    message: str
    date: str
    available: bool
    can_apply: bool
    github_ok: bool
