from tests.helpers import auth_header, login


async def test_login_and_headers(client):
    response = await login(client, "admin", "adminpassword1")
    assert response.status_code == 200
    body = response.json()
    assert body["role"] == "admin"
    assert body["conversation_id"] is None
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["cache-control"] == "no-store"
    me = await client.get("/api/auth/me")
    assert me.status_code == 200
    assert me.json()["login"] == "admin"


async def test_wrong_password_and_missing_csrf(client):
    bad = await login(client, "admin", "not-the-password")
    assert bad.status_code == 401
    assert bad.json()["error"] == "invalid_credentials"
    missing = await client.post("/api/auth/login", json={"login": "admin", "password": "adminpassword1"})
    assert missing.status_code == 403
    assert missing.json()["error"] == "csrf"


async def test_no_registration_route(client):
    response = await client.post("/api/auth/register", json={"login": "a", "password": "b"})
    assert response.status_code == 404


async def test_admin_password_change_does_not_follow_env(client):
    assert (await login(client, "admin", "adminpassword1")).status_code == 200
    headers = await auth_header(client)
    changed = await client.post(
        "/api/auth/password",
        json={"current_password": "adminpassword1", "new_password": "new-admin-pass"},
        headers=headers,
    )
    assert changed.status_code == 200
    assert (await client.get("/api/auth/me")).status_code == 401
    assert (await login(client, "admin", "adminpassword1")).status_code == 401
    assert (await login(client, "admin", "new-admin-pass")).status_code == 200

    from app.core.db import get_sessionmaker
    from app.modules.auth.service import ensure_admin

    async with get_sessionmaker()() as session:
        await ensure_admin(session)
        await session.commit()
    assert (await login(client, "admin", "new-admin-pass")).status_code == 200


async def test_case_insensitive_login(client):
    assert (await login(client, "AdMiN", "adminpassword1")).status_code == 200
