"""Initial schema. Do not edit after the first production deploy; add a new revision.

Revision ID: 001_initial
Revises:
Create Date: 2026-09-23
"""

from alembic import op

from app.core.db import Base, import_models

revision = "001_initial"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    import_models()
    bind = op.get_bind()
    Base.metadata.create_all(bind)


def downgrade() -> None:
    import_models()
    bind = op.get_bind()
    Base.metadata.drop_all(bind)
