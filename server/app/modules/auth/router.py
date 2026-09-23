from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.db import get_session
from app.core.deps import clear_auth_cookies, client_ip, load_user, require_csrf, require_user, set_csrf_cookie, set_session_cookie
from app.core.errors import AppError
from app.core.rate_limit import login_limiter
from app.core.security import new_token
from app.modules.auth.schemas import LoginIn, PasswordIn, SettingsIn
from app.modules.auth.service import authenticate, change_own_password, open_session, profile, revoke_current, update_settings
from app.realtime.hub import hub

router = APIRouter(prefix="/auth", tags=["auth"])


@router.get("/csrf")
async def csrf(request: Request, response: Response) -> dict:
    settings = get_settings()
    token = request.cookies.get(settings.csrf_cookie) or new_token()
    set_csrf_cookie(response, token)
    return {"token": token}


@router.post("/login")
async def login(
    payload: LoginIn,
    request: Request,
    response: Response,
    session: AsyncSession = Depends(get_session),
) -> dict:
    require_csrf(request)
    if not login_limiter.allow(f"{client_ip(request)}:{payload.login.casefold()}", 8, 15 * 60):
        raise AppError(429, "rate_limited")
    user = await authenticate(session, payload.login, payload.password)
    token = await open_session(session, user)
    set_session_cookie(response, token)
    return await profile(session, user)


@router.post("/logout")
async def logout(request: Request, response: Response, session: AsyncSession = Depends(get_session)) -> dict:
    require_csrf(request)
    try:
        _user, auth_session = await load_user(request, session)
    except AppError:
        clear_auth_cookies(response)
        return {"ok": True}
    await revoke_current(session, auth_session)
    clear_auth_cookies(response)
    return {"ok": True}


@router.get("/me")
async def me(request: Request, session: AsyncSession = Depends(get_session)) -> dict:
    user = await require_user(request, session)
    return await profile(session, user)


@router.post("/password")
async def password(
    payload: PasswordIn,
    request: Request,
    response: Response,
    session: AsyncSession = Depends(get_session),
) -> dict:
    require_csrf(request)
    user = await require_user(request, session)
    await change_own_password(session, user, payload.current_password, payload.new_password)
    await hub.disconnect_user(user.id)
    clear_auth_cookies(response)
    return {"ok": True}


@router.patch("/settings")
async def settings(
    payload: SettingsIn,
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> dict:
    require_csrf(request)
    user = await require_user(request, session)
    return await update_settings(session, user, payload.theme, payload.notifications_enabled)
