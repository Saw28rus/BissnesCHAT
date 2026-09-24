from tests.helpers import auth_header, login


async def _admin(client):
    assert (await login(client, "admin", "adminpassword1")).status_code == 200
    return await auth_header(client)


async def test_client_card_fields_roundtrip(client):
    headers = await _admin(client)
    created = await client.post(
        "/api/accounts",
        json={
            "display_name": "Иванов Иван",
            "login": "ivan.card",
            "password": "clientpass12",
            "phone": "+79001112233",
            "fields": [{"label": "ЭДО", "value": "2AEF-1"}, {"label": "Договор", "value": "44"}],
        },
        headers=headers,
    )
    assert created.status_code == 201, created.text
    account_id = created.json()["id"]
    card = await client.get(f"/api/accounts/{account_id}", headers=headers)
    body = card.json()
    assert body["phone"] == "+79001112233"
    assert body["edo_id"] == "2AEF-1"
    assert [item["label"] for item in body["fields"]] == ["ЭДО", "Договор"]
    updated = await client.patch(
        f"/api/accounts/{account_id}",
        json={"fields": [{"label": "ИНН", "value": "1234567890"}]},
        headers=headers,
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["inn"] == "1234567890"
    assert updated.json()["edo_id"] is None
    assert updated.json()["fields"][0]["label"] == "ИНН"
    listed = await client.get("/api/accounts?q=1234567890", headers=headers)
    assert any(item["id"] == account_id for item in listed.json())
    empty = await client.patch(
        f"/api/accounts/{account_id}",
        json={"fields": []},
        headers=headers,
    )
    assert empty.json()["fields"] == []
    assert empty.json()["inn"] is None
