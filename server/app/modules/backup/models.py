from datetime import datetime

from sqlalchemy import DateTime, Integer
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class BackupMeta(Base):
    __tablename__ = "backup_meta"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    last_export_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
