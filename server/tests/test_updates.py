from pathlib import Path

from app.core.config import get_settings
from app.core.errors import AppError
from app.modules.updates import service
from tests.helpers import auth_header, login


async def _admin(client):
    assert (await login(client, "admin", "adminpassword1")).status_code == 200
    return await auth_header(client)


def _latest(sha: str, message: str = "правка"):
    async def fetch_latest():
        return service.Latest(sha=sha, message=message, date="2026-09-23T12:00:00Z")

    return fetch_latest


def _enable_apply(monkeypatch, tmp_path: Path, current: str):
    target = tmp_path / "request"
    monkeypatch.setenv("GIT_SHA", current)
    monkeypatch.setenv("UPDATE_APPLY", "true")
    monkeypatch.setenv("UPDATE_REQUEST", str(target))
    get_settings.cache_clear()
    service.clear_cache()
    return target


async def test_updates_require_login(client):
    assert (await client.get("/api/updates")).status_code == 401


async def test_client_does_not_see_updates(client, monkeypatch):
    monkeypatch.setattr(service, "fetch_latest", _latest("b" * 40))
    service.clear_cache()
    headers = await _admin(client)
    created = await client.post(
        "/api/accounts",
        json={"display_name": "Клиент", "login": "update.client", "password": "clientpass12"},
        headers=headers,
    )
    assert created.status_code == 201, created.text
    await client.post("/api/auth/logout", headers=await auth_header(client))
    assert (await login(client, "update.client", "clientpass12")).status_code == 200
    hidden = await client.get("/api/updates")
    assert hidden.status_code == 404


async def test_status_shows_available_update(client, monkeypatch):
    monkeypatch.setenv("GIT_SHA", "a" * 40)
    monkeypatch.setenv("UPDATE_APPLY", "false")
    get_settings.cache_clear()
    service.clear_cache()
    monkeypatch.setattr(service, "fetch_latest", _latest("b" * 40, "сборка api"))
    await _admin(client)
    body = (await client.get("/api/updates")).json()
    assert body["available"] is True
    assert body["can_apply"] is False
    assert body["github_ok"] is True
    assert body["latest"] == "b" * 40
    assert body["message"] == "сборка api"
    assert body["current"] == "a" * 40


async def test_apply_writes_request_file(client, monkeypatch, tmp_path):
    current = "a" * 40
    target = _enable_apply(monkeypatch, tmp_path, current)
    monkeypatch.setattr(service, "fetch_latest", _latest("b" * 40))
    headers = await _admin(client)
    listed = await client.get("/api/updates")
    assert listed.json()["can_apply"] is True
    applied = await client.post("/api/updates/apply", headers=headers)
    assert applied.status_code == 200, applied.text
    assert target.exists()
    assert target.read_text(encoding="utf-8").strip()


async def test_apply_rejected_when_current(client, monkeypatch, tmp_path):
    sha = "c" * 40
    _enable_apply(monkeypatch, tmp_path, sha)
    monkeypatch.setattr(service, "fetch_latest", _latest(sha))
    headers = await _admin(client)
    denied = await client.post("/api/updates/apply", headers=headers)
    assert denied.status_code == 409
    assert denied.json()["error"] == "update_current"


async def test_github_down_does_not_break_settings(client, monkeypatch):
    async def boom():
        raise AppError(502, "update_github")

    monkeypatch.setenv("GIT_SHA", "a" * 40)
    get_settings.cache_clear()
    service.clear_cache()
    monkeypatch.setattr(service, "fetch_latest", boom)
    await _admin(client)
    listed = await client.get("/api/updates")
    assert listed.status_code == 200
    body = listed.json()
    assert body["github_ok"] is False
    assert body["available"] is False
    assert body["latest"] is None


async def test_apply_rejected_without_host_watcher(client, monkeypatch):
    monkeypatch.setenv("GIT_SHA", "a" * 40)
    monkeypatch.setenv("UPDATE_APPLY", "false")
    get_settings.cache_clear()
    service.clear_cache()
    monkeypatch.setattr(service, "fetch_latest", _latest("b" * 40))
    headers = await _admin(client)
    denied = await client.post("/api/updates/apply", headers=headers)
    assert denied.status_code == 409
    assert denied.json()["error"] == "update_unavailable"
