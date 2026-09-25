import uuid

import httpx

from app.core.errors import AppError

API = "https://api.yookassa.ru/v3"


class YookassaHttp(Exception):
    def __init__(self, status: int, payload: dict) -> None:
        self.status = status
        self.payload = payload
        super().__init__(str(status))


async def get_me(shop_id: str, secret: str) -> dict:
    return await api_json("GET", "/me", shop_id, secret)


async def create_bill(
    shop_id: str,
    secret: str,
    *,
    amount: str,
    description: str,
    expires_at: str,
    metadata: dict[str, str],
    return_url: str,
) -> dict:
    invoice_body = {
        "payment_data": {
            "amount": {"value": amount, "currency": "RUB"},
            "capture": True,
            "description": description,
            "metadata": metadata,
        },
        "cart": [
            {
                "description": description,
                "price": {"value": amount, "currency": "RUB"},
                "quantity": 1.0,
            }
        ],
        "delivery_method_data": {"type": "self"},
        "locale": "ru_RU",
        "expires_at": expires_at,
        "description": description,
        "metadata": metadata,
    }
    try:
        data = await api_json("POST", "/invoices", shop_id, secret, invoice_body, str(uuid.uuid4()))
        delivery = data.get("delivery_method") if isinstance(data.get("delivery_method"), dict) else {}
        url = str(delivery.get("url") or data.get("url") or "")
        remote_id = str(data.get("id") or "")
        if url or remote_id.startswith("in-"):
            return {
                "kind": "invoice",
                "remote_id": remote_id,
                "url": url,
                "test": bool(data.get("test")),
                "status": data.get("status") or "pending",
            }
    except YookassaHttp as exc:
        if exc.status not in {400, 403, 404}:
            raise_from_http(exc)
    payment_body = {
        "amount": {"value": amount, "currency": "RUB"},
        "capture": True,
        "confirmation": {"type": "redirect", "return_url": return_url},
        "description": description,
        "metadata": metadata,
    }
    try:
        data = await api_json("POST", "/payments", shop_id, secret, payment_body, str(uuid.uuid4()))
    except YookassaHttp as exc:
        raise_from_http(exc)
    url = (data.get("confirmation") or {}).get("confirmation_url")
    if not url:
        raise AppError(502, "yookassa_unavailable")
    return {
        "kind": "payment",
        "remote_id": data["id"],
        "url": url,
        "test": bool(data.get("test")),
        "status": data.get("status") or "pending",
    }


async def get_invoice(shop_id: str, secret: str, invoice_id: str) -> dict:
    return await api_json("GET", f"/invoices/{invoice_id}", shop_id, secret)


async def get_payment(shop_id: str, secret: str, payment_id: str) -> dict:
    return await api_json("GET", f"/payments/{payment_id}", shop_id, secret)


async def api_json(
    method: str,
    path: str,
    shop_id: str,
    secret: str,
    payload: dict | None = None,
    idempotence: str | None = None,
) -> dict:
    headers = {"Content-Type": "application/json"}
    if idempotence:
        headers["Idempotence-Key"] = idempotence
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            response = await client.request(
                method,
                f"{API}{path}",
                json=payload,
                headers=headers,
                auth=(shop_id, secret),
            )
    except httpx.HTTPError as exc:
        raise AppError(502, "yookassa_unavailable") from exc
    data = {}
    if response.content:
        try:
            parsed = response.json()
            if isinstance(parsed, dict):
                data = parsed
        except ValueError:
            data = {}
    if response.status_code >= 400:
        raise YookassaHttp(response.status_code, data)
    return data


def raise_from_http(exc: YookassaHttp) -> None:
    if exc.status in {401, 403}:
        raise AppError(400, "yookassa_auth") from exc
    if exc.status >= 500:
        raise AppError(502, "yookassa_unavailable") from exc
    raise AppError(400, "yookassa_rejected") from exc
