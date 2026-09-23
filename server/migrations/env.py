from logging.config import fileConfig

from alembic import context
from sqlalchemy import create_engine, pool

from app.core.config import get_settings
from app.core.db import Base, import_models

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

import_models()
target_metadata = Base.metadata


def _sync_url() -> str:
    return (
        get_settings()
        .database_url.replace("+asyncpg", "+psycopg")
        .replace("+aiosqlite", "")
    )


def run_migrations_offline() -> None:
    context.configure(url=_sync_url(), target_metadata=target_metadata, literal_binds=True)
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = create_engine(_sync_url(), poolclass=pool.NullPool)
    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
