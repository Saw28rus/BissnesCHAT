from tests.helpers import auth_header, login


async def test_broadcast_reaches_selected_clients_only(client):
    assert (await login(client, "admin", "adminpassword1")).status_code == 200
    first = await client.post(
        "/api/accounts",
        json={"display_name": "Один", "login": "one.client", "password": "clientpass12"},
        headers=await auth_header(client),
    )
    second = await client.post(
        "/api/accounts",
        json={"display_name": "Два", "login": "two.client", "password": "clientpass12"},
        headers=await auth_header(client),
    )
    skipped = await client.post(
        "/api/accounts",
        json={"display_name": "Три", "login": "three.client", "password": "clientpass12"},
        headers=await auth_header(client),
    )
    assert first.status_code == 201
    assert second.status_code == 201
    sent = await client.post(
        "/api/broadcast",
        json={
            "body": "Общее объявление",
            "account_ids": [first.json()["id"], second.json()["id"]],
        },
        headers=await auth_header(client),
    )
    assert sent.status_code == 200, sent.text
    assert sent.json() == {"sent": 2, "skipped": 0}
    await client.post("/api/auth/logout", headers=await auth_header(client))
    assert (await login(client, "one.client", "clientpass12")).status_code == 200
    mine = await client.get(f"/api/conversations/{first.json()['conversation_id']}/messages")
    assert any(item["body"] == "Общее объявление" for item in mine.json()["messages"])
    await client.post("/api/auth/logout", headers=await auth_header(client))
    assert (await login(client, "three.client", "clientpass12")).status_code == 200
    other = await client.get(f"/api/conversations/{skipped.json()['conversation_id']}/messages")
    assert other.json()["messages"] == []
    hidden = await client.post(
        "/api/broadcast",
        json={"body": "нельзя", "account_ids": [first.json()["id"]]},
        headers=await auth_header(client),
    )
    assert hidden.status_code == 404
