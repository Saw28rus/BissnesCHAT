import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent / ".tmp"
ROOT.mkdir(parents=True, exist_ok=True)
DB_PATH = ROOT / "test.db"
UPLOADS = ROOT / "uploads"
UPLOADS.mkdir(parents=True, exist_ok=True)

os.environ["ENVIRONMENT"] = "test"
os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{DB_PATH.as_posix()}"
os.environ["UPLOAD_DIR"] = str(UPLOADS)
os.environ["SECRET_KEY"] = "test-secret-key"
os.environ["ADMIN_LOGIN"] = "admin"
os.environ["ADMIN_PASSWORD"] = "adminpassword1"
os.environ["PUBLIC_ORIGIN"] = "http://testserver"
os.environ["COOKIE_SECURE"] = "false"
os.environ["TRUST_PROXY"] = "false"
os.environ["RATE_LIMIT_ENABLED"] = "false"
os.environ["DISK_MIN_FREE_BYTES"] = "0"
os.environ["GIT_SHA"] = "test-local-sha"
os.environ["UPDATE_APPLY"] = "false"
os.environ["UPDATE_REQUEST"] = ""

import pytest
from httpx import ASGITransport, AsyncClient

from app.core.config import get_settings
from app.core.rate_limit import login_limiter, message_limiter, update_limiter, upload_limiter
from app.main import app
from app.modules.backup.store import preview_store
from app.modules.updates import service as update_service


@pytest.fixture
async def client():
    if DB_PATH.exists():
        DB_PATH.unlink()
    for item in UPLOADS.iterdir():
        if item.is_file():
            item.unlink()
    get_settings.cache_clear()
    preview_store.clear()
    update_service.clear_cache()
    login_limiter.clear()
    message_limiter.clear()
    upload_limiter.clear()
    update_limiter.clear()
    transport = ASGITransport(app=app)
    async with app.router.lifespan_context(app):
        async with AsyncClient(transport=transport, base_url="http://testserver") as async_client:
            yield async_client
