"""Custom fields on the client card.

Revision ID: 004_client_fields
Revises: 003_admin_cabinet
Create Date: 2026-09-24
"""

from alembic import op

from app.core.db import Base, import_models

revision = "004_client_fields"
down_revision = "003_admin_cabinet"
branch_labels = None
depends_on = None


def upgrade() -> None:
    import_models()
    bind = op.get_bind()
    Base.metadata.create_all(bind)


def downgrade() -> None:
    op.drop_table("client_fields")
