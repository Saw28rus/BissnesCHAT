from pydantic import BaseModel, Field, field_validator


class ClientParam(BaseModel):
    label: str = Field(min_length=1, max_length=40)
    value: str = Field(default="", max_length=200)


class AccountCreate(BaseModel):
    display_name: str = Field(min_length=1, max_length=120)
    login: str = Field(min_length=3, max_length=64, pattern=r"^[A-Za-z0-9._-]+$")
    password: str = Field(min_length=10, max_length=128)
    phone: str | None = Field(default=None, max_length=32)
    inn: str | None = Field(default=None, max_length=12, pattern=r"^$|^[0-9]{10}$|^[0-9]{12}$")
    edo_id: str | None = Field(default=None, max_length=64)
    note: str | None = Field(default=None, max_length=2000)
    fields: list[ClientParam] = Field(default_factory=list)

    @field_validator("fields")
    @classmethod
    def cap_fields(cls, value: list[ClientParam]) -> list[ClientParam]:
        if len(value) > 20:
            raise ValueError("too many fields")
        return value


class AccountUpdate(BaseModel):
    display_name: str | None = Field(default=None, min_length=1, max_length=120)
    login: str | None = Field(default=None, min_length=3, max_length=64, pattern=r"^[A-Za-z0-9._-]+$")
    phone: str | None = Field(default=None, max_length=32)
    inn: str | None = Field(default=None, max_length=12, pattern=r"^$|^[0-9]{10}$|^[0-9]{12}$")
    edo_id: str | None = Field(default=None, max_length=64)
    note: str | None = Field(default=None, max_length=2000)
    fields: list[ClientParam] | None = None

    @field_validator("fields")
    @classmethod
    def cap_fields(cls, value: list[ClientParam] | None) -> list[ClientParam] | None:
        if value is not None and len(value) > 20:
            raise ValueError("too many fields")
        return value


class AccountPassword(BaseModel):
    password: str = Field(min_length=10, max_length=128)
