import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.core.config import get_settings
from app.core.db import dispose_engine, get_engine, get_sessionmaker, import_models
from app.core.errors import AppError
from app.modules.accounts.router import router as accounts_router
from app.modules.attachments.router import router as attachments_router
from app.modules.audit.router import router as audit_router
from app.modules.auth.router import router as auth_router
from app.modules.auth.service import ensure_admin
from app.modules.backup.router import router as backup_router
from app.modules.conversations.router import router as conversations_router
from app.realtime.router import router as realtime_router

logger = logging.getLogger("bchat")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    import_models()
    settings = get_settings()
    settings.upload_dir.mkdir(parents=True, exist_ok=True)
    if settings.environment in {"development", "test"}:
        from app.core.db import Base

        async with get_engine().begin() as connection:
            await connection.run_sync(Base.metadata.create_all)
    async with get_sessionmaker()() as session:
        await ensure_admin(session)
        await session.commit()
    yield
    await dispose_engine()


def create_app() -> FastAPI:
    settings = get_settings()
    docs = None if settings.environment == "production" else "/api/docs"
    app = FastAPI(title="Бизнес ЧАТ", docs_url=docs, redoc_url=None, lifespan=lifespan)
    app.include_router(auth_router, prefix="/api")
    app.include_router(accounts_router, prefix="/api")
    app.include_router(conversations_router, prefix="/api")
    app.include_router(attachments_router, prefix="/api")
    app.include_router(backup_router, prefix="/api")
    app.include_router(audit_router, prefix="/api")
    app.include_router(realtime_router)

    @app.get("/api/health")
    async def health() -> dict:
        return {"ok": True}

    @app.exception_handler(AppError)
    async def app_error(_request: Request, exc: AppError) -> JSONResponse:
        return JSONResponse(status_code=exc.status, content={"error": exc.code})

    @app.exception_handler(RequestValidationError)
    async def validation_error(_request: Request, exc: RequestValidationError) -> JSONResponse:
        fields = []
        for item in exc.errors():
            parts = [str(part) for part in item.get("loc", []) if part not in {"body", "query", "path"}]
            if parts:
                fields.append(".".join(parts))
        return JSONResponse(status_code=422, content={"error": "validation", "fields": fields})

    @app.exception_handler(Exception)
    async def unexpected(_request: Request, exc: Exception) -> JSONResponse:
        logger.exception("unhandled error")
        return JSONResponse(status_code=500, content={"error": "server_error"})

    @app.middleware("http")
    async def security_headers(request: Request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Permissions-Policy"] = "microphone=(self), camera=()"
        if request.url.path.startswith("/api"):
            response.headers["Cache-Control"] = "no-store"
        return response

    return app


app = create_app()
