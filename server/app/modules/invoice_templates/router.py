from uuid import UUID

from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.core.deps import require_admin, require_csrf
from app.modules.invoice_templates.schemas import TemplateIn, TemplatePatch
from app.modules.invoice_templates.service import create_template, delete_template, list_templates, update_template

router = APIRouter(prefix="/invoice-templates", tags=["invoice-templates"])


@router.get("")
async def get_templates(request: Request, session: AsyncSession = Depends(get_session)) -> list[dict]:
    await require_admin(request, session)
    return await list_templates(session)


@router.post("", status_code=201)
async def post_template(payload: TemplateIn, request: Request, session: AsyncSession = Depends(get_session)) -> dict:
    require_csrf(request)
    actor = await require_admin(request, session)
    return await create_template(session, actor, payload.title, payload.body)


@router.patch("/{template_id}")
async def patch_template(
    template_id: UUID,
    payload: TemplatePatch,
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> dict:
    require_csrf(request)
    actor = await require_admin(request, session)
    return await update_template(session, actor, template_id, payload.title, payload.body)


@router.delete("/{template_id}")
async def remove_template(template_id: UUID, request: Request, session: AsyncSession = Depends(get_session)) -> Response:
    require_csrf(request)
    actor = await require_admin(request, session)
    await delete_template(session, actor, template_id)
    return Response(status_code=204)
