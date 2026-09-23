from fastapi import APIRouter, Depends, File, Form, Request, UploadFile
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.core.deps import load_user, require_csrf
from app.core.errors import AppError
from app.modules.backup.schemas import RestoreIn
from app.modules.backup.service import build_preview, export_backup, restore_backup, status

router = APIRouter(prefix="/backup", tags=["backup"])

_MAX_BLOB = 16 * 1024 * 1024


async def _admin(request: Request, session: AsyncSession):
    user, auth_session = await load_user(request, session)
    if user.role != "admin":
        raise AppError(404, "not_found")
    return user, auth_session


@router.get("/status")
async def get_status(request: Request, session: AsyncSession = Depends(get_session)) -> dict:
    await _admin(request, session)
    return await status(session)


@router.post("/export")
async def post_export(
    request: Request,
    password: str = Form(...),
    include_messages: bool = Form(default=True),
    session: AsyncSession = Depends(get_session),
) -> Response:
    require_csrf(request)
    actor, _auth = await _admin(request, session)
    blob = await export_backup(session, actor, password, include_messages)
    return Response(
        content=blob,
        media_type="application/octet-stream",
        headers={"Content-Disposition": 'attachment; filename="bchat-backup.bin"'},
    )


@router.post("/preview")
async def post_preview(
    request: Request,
    password: str = Form(...),
    upload: UploadFile = File(...),
    session: AsyncSession = Depends(get_session),
) -> dict:
    require_csrf(request)
    actor, auth_session = await _admin(request, session)
    blob = await upload.read(_MAX_BLOB + 1)
    return await build_preview(session, actor, auth_session.id, password, blob)


@router.post("/restore")
async def post_restore(
    payload: RestoreIn,
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> dict:
    require_csrf(request)
    actor, auth_session = await _admin(request, session)
    return await restore_backup(session, actor, auth_session.id, payload.preview_id)
