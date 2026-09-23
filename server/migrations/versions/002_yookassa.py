"""YooKassa settings and invoices.

Revision ID: 002_yookassa
Revises: 001_initial
Create Date: 2026-09-23
"""

from alembic import op

from app.core.db import Base, import_models

revision = "002_yookassa"
down_revision = "001_initial"
branch_labels = None
depends_on = None


def upgrade() -> None:
    import_models()
    bind = op.get_bind()
    Base.metadata.create_all(bind)


def downgrade() -> None:
    op.drop_table("invoices")
    op.drop_table("yookassa_settings")
