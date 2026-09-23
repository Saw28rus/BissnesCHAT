from collections.abc import AsyncIterator

from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

_engine: AsyncEngine | None = None
_sessionmaker: async_sessionmaker[AsyncSession] | None = None


class Base(DeclarativeBase):
    pass


def import_models() -> None:
    from app.modules.accounts import models as account_models  # noqa: F401
    from app.modules.attachments import models as attachment_models  # noqa: F401
    from app.modules.audit import models as audit_models  # noqa: F401
    from app.modules.auth import models as auth_models  # noqa: F401
    from app.modules.backup import models as backup_models  # noqa: F401
    from app.modules.conversations import models as conversation_models  # noqa: F401


def get_engine() -> AsyncEngine:
    global _engine
    if _engine is None:
        from app.core.config import get_settings

        url = get_settings().database_url
        kwargs: dict = {}
        if url.startswith("sqlite"):
            kwargs["connect_args"] = {"check_same_thread": False}
        else:
            kwargs["pool_size"] = 5
            kwargs["max_overflow"] = 5
        _engine = create_async_engine(url, **kwargs)
        if url.startswith("sqlite"):
            from sqlalchemy import event

            @event.listens_for(_engine.sync_engine, "connect")
            def _enable_sqlite_fk(dbapi_connection, _record) -> None:
                cursor = dbapi_connection.cursor()
                cursor.execute("PRAGMA foreign_keys=ON")
                cursor.close()

    return _engine


def get_sessionmaker() -> async_sessionmaker[AsyncSession]:
    global _sessionmaker
    if _sessionmaker is None:
        _sessionmaker = async_sessionmaker(get_engine(), expire_on_commit=False)
    return _sessionmaker


async def get_session() -> AsyncIterator[AsyncSession]:
    async with get_sessionmaker()() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


async def dispose_engine() -> None:
    global _engine, _sessionmaker
    if _engine is not None:
        await _engine.dispose()
    _engine = None
    _sessionmaker = None
