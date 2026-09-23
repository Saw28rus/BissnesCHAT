from httpx import AsyncClient


async def csrf(client: AsyncClient) -> str:
    response = await client.get("/api/auth/csrf")
    assert response.status_code == 200
    return response.json()["token"]


async def login(client: AsyncClient, login_name: str, password: str):
    token = await csrf(client)
    return await client.post(
        "/api/auth/login",
        json={"login": login_name, "password": password},
        headers={"X-CSRF-Token": token},
    )


async def auth_header(client: AsyncClient) -> dict[str, str]:
    return {"X-CSRF-Token": await csrf(client)}
