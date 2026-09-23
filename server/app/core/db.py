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
    from app.modules.invoice_templates import models as invoice_template_models  # noqa: F401
    from app.modules.yookassa import models as yookassa_models  # noqa: F401


def _add_missing_columns(connection) -> None:
    from sqlalchemy import inspect, text

    extras = {
        "users": {
            "phone": "ALTER TABLE users ADD COLUMN phone VARCHAR(32)",
            "inn": "ALTER TABLE users ADD COLUMN inn VARCHAR(12)",
            "edo_id": "ALTER TABLE users ADD COLUMN edo_id VARCHAR(64)",
        },
        "invoices": {
            "period": "ALTER TABLE invoices ADD COLUMN period VARCHAR(64)",
            "expires_at": "ALTER TABLE invoices ADD COLUMN expires_at DATETIME",
            "deleted_at": "ALTER TABLE invoices ADD COLUMN deleted_at DATETIME",
        },
    }
    inspector = inspect(connection)
    tables = set(inspector.get_table_names())
    for table, columns in extras.items():
        if table not in tables:
            continue
        existing = {item["name"] for item in inspector.get_columns(table)}
        for name, ddl in columns.items():
            if name not in existing:
                connection.execute(text(ddl))


async def ensure_sqlite_columns() -> None:
    engine = get_engine()
    if not str(engine.url).startswith("sqlite"):
        return
    async with engine.begin() as connection:
        await connection.run_sync(_add_missing_columns)


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
