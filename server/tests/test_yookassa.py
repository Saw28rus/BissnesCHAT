import uuid

from tests.helpers import auth_header, login

from app.modules.yookassa.client import YookassaHttp


async def _admin(client):
    assert (await login(client, "admin", "adminpassword1")).status_code == 200
    return await auth_header(client)


async def _open_client(client, login_name: str):
    headers = await _admin(client)
    created = await client.post(
        "/api/accounts",
        json={"display_name": login_name, "login": login_name, "password": "clientpass12"},
        headers=headers,
    )
    assert created.status_code == 201, created.text
    return created.json()


def _patch_yookassa(monkeypatch, *, me=None, bill=None, invoice=None, payment=None):
    async def get_me(shop_id: str, secret: str):
        if me is not None:
            if isinstance(me, Exception):
                raise me
            return me(shop_id, secret) if callable(me) else me
        if secret != "test_secret_key_ok":
            raise YookassaHttp(401, {"code": "invalid_credentials"})
        return {"account_id": shop_id, "test": True, "account_name": "Тестовый магазин", "status": "enabled"}

    async def create_bill(shop_id, secret, **kwargs):
        if bill is not None:
            return bill if not callable(bill) else bill(shop_id, secret, **kwargs)
        return {
            "kind": "invoice",
            "remote_id": "in-test-invoice",
            "url": "https://yookassa.ru/my/i/test",
            "test": True,
            "status": "pending",
        }

    async def get_invoice(shop_id, secret, invoice_id):
        if invoice is not None:
            return invoice if not callable(invoice) else invoice(invoice_id)
        return {"id": invoice_id, "status": "pending"}

    async def get_payment(shop_id, secret, payment_id):
        if payment is not None:
            return payment if not callable(payment) else payment(payment_id)
        return {"id": payment_id, "status": "pending"}

    monkeypatch.setattr("app.modules.yookassa.client.get_me", get_me)
    monkeypatch.setattr("app.modules.yookassa.client.create_bill", create_bill)
    monkeypatch.setattr("app.modules.yookassa.client.get_invoice", get_invoice)
    monkeypatch.setattr("app.modules.yookassa.client.get_payment", get_payment)


async def test_connect_hides_secret_and_client_cannot_see(client, monkeypatch):
    _patch_yookassa(monkeypatch)
    headers = await _admin(client)
    connected = await client.post(
        "/api/yookassa/connect",
        json={"shop_id": "123456", "secret_key": "test_secret_key_ok"},
        headers=headers,
    )
    assert connected.status_code == 200, connected.text
    body = connected.json()
    assert body["connected"] is True
    assert body["shop_id"] == "123456"
    assert body["test"] is True
    assert "secret_key" not in body
    assert "test_secret_key_ok" not in connected.text
    assert body["secret_hint"].startswith("••••")
    assert body["secret_hint"].endswith("y_ok")
    listed = await client.get("/api/yookassa")
    assert listed.status_code == 200
    assert "test_secret_key_ok" not in listed.text
    assert listed.json()["secret_hint"] == body["secret_hint"]
    await client.post("/api/auth/logout", headers=await auth_header(client))
    account = await _open_client(client, "payer")
    await client.post("/api/auth/logout", headers=await auth_header(client))
    assert (await login(client, "payer", "clientpass12")).status_code == 200
    hidden = await client.get("/api/yookassa")
    assert hidden.status_code == 404
    invoice = await client.post(
        f"/api/conversations/{account['conversation_id']}/invoices",
        json={"amount": "150.00", "description": "Работа"},
        headers=await auth_header(client),
    )
    assert invoice.status_code == 404


async def test_wrong_secret_is_rejected(client, monkeypatch):
    _patch_yookassa(monkeypatch)
    headers = await _admin(client)
    failed = await client.post(
        "/api/yookassa/connect",
        json={"shop_id": "123456", "secret_key": "wrong_secret_key_xx"},
        headers=headers,
    )
    assert failed.status_code == 400
    assert failed.json()["error"] == "yookassa_auth"


async def test_admin_sends_invoice_and_webhook_marks_paid(client, monkeypatch):
    _patch_yookassa(
        monkeypatch,
        invoice={"id": "in-test-invoice", "status": "succeeded", "payment_details": {"id": "pay-1"}},
    )
    account = await _open_client(client, "buyer")
    await client.post("/api/auth/logout", headers=await auth_header(client))
    headers = await _admin(client)
    connected = await client.post(
        "/api/yookassa/connect",
        json={"shop_id": "123456", "secret_key": "test_secret_key_ok"},
        headers=headers,
    )
    assert connected.status_code == 200
    created = await client.post(
        f"/api/conversations/{account['conversation_id']}/invoices",
        json={"amount": "1500,50", "description": "Ремонт кухни"},
        headers=await auth_header(client),
    )
    assert created.status_code == 201, created.text
    payload = created.json()
    assert payload["type"] == "invoice"
    assert payload["invoice"]["amount"] == "1500.50"
    assert payload["invoice"]["status"] == "pending"
    assert payload["invoice"]["pay_url"] == "https://yookassa.ru/my/i/test"
    assert "yookassa_invoice_id" not in payload
    notify = await client.post(
        "/api/yookassa/notifications",
        json={
            "type": "notification",
            "event": "invoice.succeeded",
            "object": {"id": "in-test-invoice", "status": "succeeded"},
        },
    )
    assert notify.status_code == 200, notify.text
    history = await client.get(f"/api/conversations/{account['conversation_id']}/messages")
    card = next(item for item in history.json()["messages"] if item["id"] == payload["id"])
    assert card["invoice"]["status"] == "succeeded"
    assert card["invoice"]["pay_url"] is None


async def test_invoice_without_connection(client):
    account = await _open_client(client, "waiting")
    await client.post("/api/auth/logout", headers=await auth_header(client))
    headers = await _admin(client)
    created = await client.post(
        f"/api/conversations/{account['conversation_id']}/invoices",
        json={"amount": "10.00", "description": "Тест"},
        headers=headers,
    )
    assert created.status_code == 400
    assert created.json()["error"] == "yookassa_not_connected"


async def test_letter_and_invoice_buckets(client, monkeypatch):
    from app.modules.yookassa.letter import fill_template, format_rub, period_label

    assert period_label("2026-04") == "Апрель 2026"
    assert format_rub("1800.00") == "1 800 ₽"
    assert "ИП Лобанов" in fill_template(
        "Здравствуйте, {name}! Счёт за {period} на сумму {amount} готов.",
        name="ИП Лобанов",
        period="Апрель 2026",
        amount="1 800 ₽",
    )

    _patch_yookassa(monkeypatch)
    account = await _open_client(client, "lobanov")
    await client.post("/api/auth/logout", headers=await auth_header(client))
    headers = await _admin(client)
    await client.patch(
        f"/api/accounts/{account['id']}",
        json={"display_name": "ИП Лобанов", "edo_id": "2AEF123", "inn": "1234567890", "phone": "+79001234567"},
        headers=headers,
    )
    listed = await client.get("/api/accounts")
    card = next(item for item in listed.json() if item["id"] == account["id"])
    assert card["edo_id"] == "2AEF123"
    assert card["inn"] == "1234567890"
    assert card["phone"] == "+79001234567"

    templates = await client.get("/api/invoice-templates", headers=headers)
    assert templates.status_code == 200
    assert templates.json()[0]["body"].startswith("Здравствуйте")

    await client.post(
        "/api/yookassa/connect",
        json={"shop_id": "123456", "secret_key": "test_secret_key_ok"},
        headers=headers,
    )
    created = await client.post(
        "/api/invoices",
        json={
            "conversation_id": account["conversation_id"],
            "amount": "1800",
            "period": "2026-04",
            "days": 10,
        },
        headers=headers,
    )
    assert created.status_code == 201, created.text
    body = created.json()
    assert "ИП Лобанов" in body["body"]
    assert "Апрель 2026" in body["body"]
    assert "1 800 ₽" in body["body"]
    assert body["invoice"]["period"] == "Апрель 2026"
    issued = await client.get("/api/invoices?bucket=issued", headers=headers)
    assert issued.status_code == 200
    assert issued.json()[0]["client_name"] == "ИП Лобанов"
    hidden = await client.delete(f"/api/invoices/{issued.json()[0]['id']}", headers=headers)
    assert hidden.status_code == 200
    assert hidden.json()["bucket"] == "deleted"
    deleted = await client.get("/api/invoices?bucket=deleted", headers=headers)
    assert len(deleted.json()) == 1
    empty = await client.get("/api/invoices?bucket=issued", headers=headers)
    assert empty.json() == []
