from pydantic import BaseModel, Field


class AccountCreate(BaseModel):
    display_name: str = Field(min_length=1, max_length=120)
    login: str = Field(min_length=3, max_length=64, pattern=r"^[A-Za-z0-9._-]+$")
    password: str = Field(min_length=10, max_length=128)
    note: str | None = Field(default=None, max_length=2000)


class AccountUpdate(BaseModel):
    display_name: str | None = Field(default=None, min_length=1, max_length=120)
    login: str | None = Field(default=None, min_length=3, max_length=64, pattern=r"^[A-Za-z0-9._-]+$")
    note: str | None = Field(default=None, max_length=2000)


class AccountPassword(BaseModel):
    password: str = Field(min_length=10, max_length=128)
