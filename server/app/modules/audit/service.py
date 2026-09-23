import uuid
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import utcnow
from app.modules.audit.models import AdminAudit


async def record(
    session: AsyncSession,
    actor_id: uuid.UUID,
    action: str,
    target_id: uuid.UUID | None = None,
) -> None:
    session.add(
        AdminAudit(actor_id=actor_id, action=action, target_id=target_id, created_at=utcnow())
    )


def present(row: AdminAudit) -> dict:
    return {
        "id": str(row.id),
        "action": row.action,
        "target_id": str(row.target_id) if row.target_id else None,
        "created_at": _iso(row.created_at),
    }


async def list_recent(session: AsyncSession, limit: int = 100) -> list[dict]:
    rows = (
        await session.scalars(select(AdminAudit).order_by(AdminAudit.created_at.desc()).limit(limit))
    ).all()
    return [present(row) for row in rows]


def _iso(value: datetime) -> str:
    from datetime import UTC

    if value.tzinfo is None:
        value = value.replace(tzinfo=UTC)
    return value.isoformat()
