"""Client card fields, invoice period and templates.

Revision ID: 003_admin_cabinet
Revises: 002_yookassa
Create Date: 2026-09-23
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

from app.core.db import Base, import_models

revision = "003_admin_cabinet"
down_revision = "002_yookassa"
branch_labels = None
depends_on = None


def upgrade() -> None:
    import_models()
    bind = op.get_bind()
    Base.metadata.create_all(bind)
    inspector = inspect(bind)
    extras = (
        ("users", "phone", sa.String(32)),
        ("users", "inn", sa.String(12)),
        ("users", "edo_id", sa.String(64)),
        ("invoices", "period", sa.String(64)),
        ("invoices", "expires_at", sa.DateTime(timezone=True)),
        ("invoices", "deleted_at", sa.DateTime(timezone=True)),
    )
    for table, name, coltype in extras:
        if table not in inspector.get_table_names():
            continue
        columns = {item["name"] for item in inspector.get_columns(table)}
        if name not in columns:
            op.add_column(table, sa.Column(name, coltype, nullable=True))


def downgrade() -> None:
    op.drop_table("invoice_templates")
    for table, name in (
        ("invoices", "deleted_at"),
        ("invoices", "expires_at"),
        ("invoices", "period"),
        ("users", "edo_id"),
        ("users", "inn"),
        ("users", "phone"),
    ):
        op.drop_column(table, name)
