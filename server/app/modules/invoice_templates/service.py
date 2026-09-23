import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import AppError
from app.core.security import utcnow
from app.modules.audit.service import record
from app.modules.accounts.models import User
from app.modules.invoice_templates.models import InvoiceTemplate
from app.modules.invoice_templates.schemas import DEFAULT_BODY


def present_template(row: InvoiceTemplate) -> dict:
    return {
        "id": str(row.id),
        "title": row.title,
        "body": row.body,
        "created_at": row.created_at.isoformat(),
        "updated_at": row.updated_at.isoformat(),
    }


async def ensure_default(session: AsyncSession) -> None:
    existing = await session.scalar(select(InvoiceTemplate.id).limit(1))
    if existing is not None:
        return
    now = utcnow()
    session.add(
        InvoiceTemplate(
            title="Ежемесячный счёт",
            body=DEFAULT_BODY,
            created_at=now,
            updated_at=now,
        )
    )


async def list_templates(session: AsyncSession) -> list[dict]:
    await ensure_default(session)
    rows = (await session.scalars(select(InvoiceTemplate).order_by(InvoiceTemplate.created_at.asc()))).all()
    return [present_template(row) for row in rows]


async def get_template(session: AsyncSession, template_id: uuid.UUID) -> InvoiceTemplate:
    row = await session.get(InvoiceTemplate, template_id)
    if row is None:
        raise AppError(404, "not_found")
    return row


async def create_template(session: AsyncSession, actor: User, title: str, body: str) -> dict:
    now = utcnow()
    row = InvoiceTemplate(title=title.strip(), body=body.strip(), created_at=now, updated_at=now)
    session.add(row)
    await session.flush()
    await record(session, actor.id, "invoice.template")
    return present_template(row)


async def update_template(session: AsyncSession, actor: User, template_id: uuid.UUID, title: str | None, body: str | None) -> dict:
    row = await get_template(session, template_id)
    if title is not None:
        row.title = title.strip()
    if body is not None:
        row.body = body.strip()
    row.updated_at = utcnow()
    await record(session, actor.id, "invoice.template")
    return present_template(row)


async def delete_template(session: AsyncSession, actor: User, template_id: uuid.UUID) -> None:
    count = len((await session.scalars(select(InvoiceTemplate))).all())
    if count <= 1:
        raise AppError(400, "validation")
    row = await get_template(session, template_id)
    await session.delete(row)
    await record(session, actor.id, "invoice.template")
