from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    environment: str = "development"
    database_url: str = "sqlite+aiosqlite:///./data/bchat.db"
    secret_key: str = "dev-only-change-me"
    admin_login: str = "admin"
    admin_password: str = "change-me-please"
    public_origin: str = "http://localhost:5173"
    upload_dir: Path = Path("./data/uploads")
    cookie_secure: bool = False
    trust_proxy: bool = False
    rate_limit_enabled: bool = True
    disk_min_free_bytes: int = 5 * 1024 * 1024 * 1024
    session_days: int = 14
    git_sha: str = "unknown"
    github_repo: str = "Saw28rus/BissnesCHAT"
    github_branch: str = "main"
    update_request: str = ""
    update_apply: bool = False

    @property
    def session_cookie(self) -> str:
        return "__Host-session" if self.cookie_secure else "bchat_session"

    @property
    def csrf_cookie(self) -> str:
        return "__Host-csrf" if self.cookie_secure else "bchat_csrf"

    @property
    def allowed_origins(self) -> set[str]:
        origins = {self.public_origin.rstrip("/")}
        if self.environment == "development":
            origins.update({"http://localhost:5173", "http://127.0.0.1:5173"})
        return origins


@lru_cache
def get_settings() -> Settings:
    return Settings()
