from pydantic import BaseModel, Field


class LoginIn(BaseModel):
    login: str = Field(min_length=1, max_length=64)
    password: str = Field(min_length=1, max_length=128)


class PasswordIn(BaseModel):
    current_password: str = Field(min_length=1, max_length=128)
    new_password: str = Field(min_length=10, max_length=128)


class SettingsIn(BaseModel):
    theme: str | None = Field(default=None, pattern="^(light|dark)$")
    notifications_enabled: bool | None = None
