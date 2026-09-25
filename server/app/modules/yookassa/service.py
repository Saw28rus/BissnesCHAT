import ipaddress
import uuid
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.errors import AppError
from app.core.rate_limit import message_limiter
from app.core.security import utcnow
from app.modules.accounts.models import User
from app.modules.audit.service import record
from app.modules.conversations.access import get_conversation
from app.modules.conversations.models import Conversation, Message
from app.modules.conversations.present import iso, present_message
from app.modules.invoice_templates.models import InvoiceTemplate
from app.modules.invoice_templates.schemas import DEFAULT_BODY
from app.modules.invoice_templates.service import ensure_default, get_template
from app.modules.yookassa.letter import fill_template, format_expires, format_rub, period_label
from app.modules.yookassa import client as yk
from app.modules.yookassa.client import YookassaHttp
from app.modules.yookassa.crypto import decrypt_secret, encrypt_secret, secret_hint
from app.modules.yookassa.models import Invoice, YookassaSettings

_YOOKASSA_NETS = (
    ipaddress.ip_network("185.71.76.0/27"),
    ipaddress.ip_network("185.71.77.0/27"),
    ipaddress.ip_network("77.75.153.0/25"),
    ipaddress.ip_network("77.75.154.128/25"),
    ipaddress.ip_network("2a02:5180::/32"),
)
_YOOKASSA_HOSTS = {
    ipaddress.ip_address("77.75.156.11"),
    ipaddress.ip_address("77.75.156.35"),
}


def parse_amount(raw: str) -> str:
    cleaned = raw.replace(" ", "").replace("\u00a0", "").replace(",", ".")
    try:
        value = Decimal(cleaned)
    except InvalidOperation as exc:
        raise AppError(400, "invoice_amount") from exc
    if value < Decimal("1.00") or value > Decimal("999999.99"):
        raise AppError(400, "invoice_amount")
    return f"{value.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP):.2f}"


def webhook_url() -> str:
    origin = get_settings().public_origin.rstrip("/")
    return f"{origin}/api/yookassa/notifications"


def present_settings(row: YookassaSettings | None) -> dict:
    payload = {"connected": False, "webhook_url": webhook_url()}
    if row is None:
        return payload
    payload.update(
        {
            "connected": True,
            "shop_id": row.shop_id,
            "shop_name": row.shop_name,
            "test": row.test_mode,
            "secret_hint": row.secret_hint,
        }
    )
    return payload


def classify_invoice(invoice: Invoice) -> str:
    # ЮKassa: pending — выставлен, succeeded — оплачен, canceled — истёк или отменён.
    if invoice.deleted_at is not None:
        return "deleted"
    if invoice.status == "succeeded":
        return "paid"
    if invoice.status in {"canceled", "cancelled"}:
        return "overdue"
    return "issued"


def present_invoice(invoice: Invoice | None, deleted: bool) -> dict | None:
    if invoice is None or deleted:
        return None
    hidden = invoice.deleted_at is not None
    status = "canceled" if hidden and invoice.status == "pending" else invoice.status
    return {
        "amount": invoice.amount,
        "currency": invoice.currency,
        "description": invoice.description,
        "period": invoice.period,
        "status": status,
        "pay_url": invoice.pay_url if status == "pending" and not hidden else None,
        "test": invoice.test_mode,
        "expires_at": iso(invoice.expires_at),
    }


def present_invoice_row(invoice: Invoice, client: User) -> dict:
    return {
        "id": str(invoice.id),
        "conversation_id": str(invoice.conversation_id),
        "message_id": str(invoice.message_id),
        "client_id": str(client.id),
        "client_name": client.display_name,
        "amount": invoice.amount,
        "currency": invoice.currency,
        "period": invoice.period,
        "description": invoice.description,
        "status": invoice.status,
        "pay_url": invoice.pay_url if invoice.status == "pending" and invoice.deleted_at is None else None,
        "test": invoice.test_mode,
        "expires_at": iso(invoice.expires_at),
        "created_at": iso(invoice.created_at),
        "paid_at": iso(invoice.paid_at),
        "deleted_at": iso(invoice.deleted_at),
        "bucket": classify_invoice(invoice),
    }


async def load_settings(session: AsyncSession) -> YookassaSettings | None:
    return await session.scalar(select(YookassaSettings).limit(1))


async def invoice_map(session: AsyncSession, messages: list[Message]) -> dict[uuid.UUID, Invoice]:
    ids = [item.id for item in messages if item.type == "invoice" and item.deleted_at is None]
    if not ids:
        return {}
    rows = (await session.scalars(select(Invoice).where(Invoice.message_id.in_(ids)))).all()
    return {row.message_id: row for row in rows}


async def connect(session: AsyncSession, actor: User, shop_id: str, secret_key: str) -> dict:
    if not message_limiter.allow(f"yk:{actor.id}", 5, 60):
        raise AppError(429, "rate_limited")
    shop = shop_id.strip()
    secret = secret_key.strip()
    try:
        me = await yk.get_me(shop, secret)
    except YookassaHttp as exc:
        yk.raise_from_http(exc)
    name = str(me.get("account_name") or me.get("name") or "") or None
    test_mode = bool(me.get("test"))
    now = utcnow()
    row = await load_settings(session)
    if row is None:
        row = YookassaSettings(
            shop_id=shop,
            secret_blob=encrypt_secret(secret),
            secret_hint=secret_hint(secret),
            shop_name=name,
            test_mode=test_mode,
            connected_at=now,
        )
        session.add(row)
    else:
        row.shop_id = shop
        row.secret_blob = encrypt_secret(secret)
        row.secret_hint = secret_hint(secret)
        row.shop_name = name
        row.test_mode = test_mode
        row.connected_at = now
    await record(session, actor.id, "yookassa.connect")
    await session.flush()
    return present_settings(row)


async def disconnect(session: AsyncSession, actor: User) -> dict:
    row = await load_settings(session)
    if row is not None:
        await session.delete(row)
        await record(session, actor.id, "yookassa.disconnect")
    return present_settings(None)


async def _template_body(session: AsyncSession, template_id: uuid.UUID | None) -> str:
    await ensure_default(session)
    if template_id is not None:
        return (await get_template(session, template_id)).body
    first = await session.scalar(select(InvoiceTemplate).order_by(InvoiceTemplate.created_at.asc()))
    return first.body if first is not None else DEFAULT_BODY


async def create_invoice(
    session: AsyncSession,
    user: User,
    conversation_id: uuid.UUID,
    amount_raw: str,
    description: str | None,
    client_nonce: uuid.UUID | None,
    period: str | None = None,
    template_id: uuid.UUID | None = None,
    days: int = 7,
) -> tuple[dict, uuid.UUID]:
    if user.role != "admin":
        raise AppError(404, "not_found")
    if not message_limiter.allow(f"invoice:{user.id}", 10, 60):
        raise AppError(429, "rate_limited")
    settings_row = await load_settings(session)
    if settings_row is None:
        raise AppError(400, "yookassa_not_connected")
    from app.modules.conversations.service import _add_message, _existing_nonce, _present_one

    conversation = await get_conversation(session, user, conversation_id)
    existing = await _existing_nonce(session, conversation_id, client_nonce)
    if existing is not None:
        return await _present_one(session, existing), conversation.client_id
    amount = parse_amount(amount_raw)
    label = period_label(period)
    yk_text = (description or "").strip() or f"Счёт за {label}"
    yk_text = yk_text[:128]
    secret = decrypt_secret(settings_row.secret_blob)
    invoice_id = uuid.uuid4()
    now = utcnow()
    expires_at = now + timedelta(days=days)
    expires = expires_at.strftime("%Y-%m-%dT%H:%M:%S.000Z")
    try:
        bill = await yk.create_bill(
            settings_row.shop_id,
            secret,
            amount=amount,
            description=yk_text,
            expires_at=expires,
            metadata={"bchat_invoice": str(invoice_id)},
            return_url=get_settings().public_origin.rstrip("/"),
        )
    except YookassaHttp as exc:
        yk.raise_from_http(exc)
    client = await session.get(User, conversation.client_id)
    name = client.display_name if client is not None else "клиент"
    letter = fill_template(
        await _template_body(session, template_id),
        name=name,
        period=label,
        amount=format_rub(amount),
        url=bill["url"],
        expires=format_expires(expires_at),
    )
    message = Message(
        conversation_id=conversation.id,
        sender_id=user.id,
        type="invoice",
        body=letter,
        client_nonce=client_nonce,
        created_at=now,
        updated_at=now,
    )
    message = await _add_message(session, message)
    invoice = Invoice(
        id=invoice_id,
        conversation_id=conversation.id,
        message_id=message.id,
        yookassa_invoice_id=bill["remote_id"] if bill["kind"] == "invoice" else None,
        yookassa_payment_id=bill["remote_id"] if bill["kind"] == "payment" else None,
        amount=amount,
        currency="RUB",
        description=yk_text,
        status="pending" if bill["status"] not in {"succeeded", "canceled"} else bill["status"],
        pay_url=bill["url"],
        test_mode=bill["test"] or settings_row.test_mode,
        period=label,
        expires_at=expires_at,
        created_at=now,
        updated_at=now,
        paid_at=now if bill["status"] == "succeeded" else None,
    )
    session.add(invoice)
    await session.flush()
    await record(session, user.id, "invoice.create", conversation.client_id)
    payload = present_message(message, invoice=present_invoice(invoice, False))
    return payload, conversation.client_id


async def list_invoices(session: AsyncSession, bucket: str) -> list[dict]:
    if bucket not in {"issued", "overdue", "paid", "deleted"}:
        raise AppError(400, "validation")
    invoices = list((await session.scalars(select(Invoice).order_by(Invoice.created_at.desc()))).all())
    await refresh_invoices(session, invoices)
    if not invoices:
        return []
    conversations = {
        row.id: row
        for row in (
            await session.scalars(
                select(Conversation).where(Conversation.id.in_({item.conversation_id for item in invoices}))
            )
        ).all()
    }
    users = {
        row.id: row
        for row in (
            await session.scalars(
                select(User).where(User.id.in_({row.client_id for row in conversations.values()}))
            )
        ).all()
    }
    result = []
    for invoice in invoices:
        if classify_invoice(invoice) != bucket:
            continue
        conversation = conversations.get(invoice.conversation_id)
        client = users.get(conversation.client_id) if conversation is not None else None
        if client is None:
            continue
        result.append(present_invoice_row(invoice, client))
    return result


async def hide_invoice(session: AsyncSession, actor: User, invoice_id: uuid.UUID) -> dict:
    invoice = await session.get(Invoice, invoice_id)
    if invoice is None or invoice.deleted_at is not None:
        raise AppError(404, "not_found")
    now = utcnow()
    invoice.deleted_at = now
    invoice.updated_at = now
    conversation = await session.get(Conversation, invoice.conversation_id)
    client = await session.get(User, conversation.client_id) if conversation is not None else None
    if client is None:
        raise AppError(404, "not_found")
    await record(session, actor.id, "invoice.delete", client.id)
    return present_invoice_row(invoice, client)


async def apply_status(invoice: Invoice, status: str, payment_id: str | None) -> bool:
    mapped = "pending"
    if status in {"succeeded", "waiting_for_capture"}:
        mapped = "succeeded"
    elif status in {"canceled", "cancelled"}:
        mapped = "canceled"
    if invoice.status == "succeeded":
        return False
    if invoice.status == mapped:
        if payment_id and not invoice.yookassa_payment_id:
            invoice.yookassa_payment_id = payment_id
            return True
        return False
    now = utcnow()
    invoice.status = mapped
    invoice.updated_at = now
    if payment_id:
        invoice.yookassa_payment_id = payment_id
    if mapped == "succeeded":
        invoice.paid_at = now
    return True


async def handle_notification(session: AsyncSession, payload: dict, client_host: str) -> dict | None:
    settings = get_settings()
    if settings.environment == "production" and not _allowed_ip(client_host):
        raise AppError(403, "forbidden")
    settings_row = await load_settings(session)
    if settings_row is None:
        return None
    event = str(payload.get("event") or "")
    obj = payload.get("object")
    if not isinstance(obj, dict):
        return None
    secret = decrypt_secret(settings_row.secret_blob)
    invoice: Invoice | None = None
    payment_id = None
    remote_status = str(obj.get("status") or "")
    object_id = str(obj.get("id") or "")
    if event.startswith("payment.") or (object_id and not object_id.startswith("in-") and not event.startswith("invoice.")):
        payment_id = object_id
        if payment_id:
            try:
                verified = await yk.get_payment(settings_row.shop_id, secret, payment_id)
            except YookassaHttp:
                return None
            remote_status = str(verified.get("status") or remote_status)
            payment_id = str(verified.get("id") or payment_id)
            invoice = await _find_invoice(session, verified)
    if invoice is None:
        invoice_id = object_id
        details = obj.get("invoice_details")
        if isinstance(details, dict) and details.get("id"):
            invoice_id = str(details["id"])
        if invoice_id.startswith("in-"):
            try:
                verified = await yk.get_invoice(settings_row.shop_id, secret, invoice_id)
            except YookassaHttp:
                return None
            remote_status = str(verified.get("status") or remote_status)
            invoice = await _find_invoice(session, verified)
            details = verified.get("payment_details")
            if isinstance(details, dict) and details.get("id"):
                payment_id = str(details["id"])
    if invoice is None:
        return None
    if not await apply_status(invoice, remote_status, payment_id):
        message = await session.get(Message, invoice.message_id)
        if message is None:
            return None
        return present_message(message, invoice=present_invoice(invoice, message.deleted_at is not None))
    message = await session.get(Message, invoice.message_id)
    if message is None:
        return None
    message.updated_at = utcnow()
    return present_message(message, invoice=present_invoice(invoice, message.deleted_at is not None))


async def refresh_invoices(session: AsyncSession, invoices: list[Invoice], limit: int = 20) -> None:
    settings_row = await load_settings(session)
    if settings_row is None:
        return
    pending = [item for item in invoices if item.status == "pending" and item.deleted_at is None]
    if not pending:
        return
    secret = decrypt_secret(settings_row.secret_blob)
    for invoice in pending[:limit]:
        try:
            if invoice.yookassa_invoice_id:
                data = await yk.get_invoice(settings_row.shop_id, secret, invoice.yookassa_invoice_id)
                status = str(data.get("status") or "")
                details = data.get("payment_details")
                payment_id = str(details["id"]) if isinstance(details, dict) and details.get("id") else None
            elif invoice.yookassa_payment_id:
                data = await yk.get_payment(settings_row.shop_id, secret, invoice.yookassa_payment_id)
                status = str(data.get("status") or "")
                payment_id = str(data.get("id") or invoice.yookassa_payment_id)
            else:
                continue
        except (YookassaHttp, AppError):
            continue
        if await apply_status(invoice, status, payment_id):
            message = await session.get(Message, invoice.message_id)
            if message is not None:
                message.updated_at = utcnow()


async def refresh_pending(session: AsyncSession, messages: list[Message]) -> None:
    mapping = await invoice_map(session, messages)
    pending = [mapping[item.id] for item in messages if item.id in mapping]
    await refresh_invoices(session, pending, limit=8)


async def _find_invoice(session: AsyncSession, obj: dict) -> Invoice | None:
    meta = obj.get("metadata") if isinstance(obj.get("metadata"), dict) else {}
    marker = str(meta.get("bchat_invoice") or "")
    if marker:
        try:
            found = await session.get(Invoice, uuid.UUID(marker))
            if found is not None:
                return found
        except ValueError:
            pass
    details = obj.get("invoice_details")
    invoice_id = ""
    if isinstance(details, dict):
        invoice_id = str(details.get("id") or "")
    if not invoice_id and str(obj.get("id") or "").startswith("in-"):
        invoice_id = str(obj.get("id"))
    if invoice_id:
        found = await session.scalar(select(Invoice).where(Invoice.yookassa_invoice_id == invoice_id))
        if found is not None:
            return found
    payment_id = str(obj.get("id") or "")
    if payment_id and not payment_id.startswith("in-"):
        found = await session.scalar(select(Invoice).where(Invoice.yookassa_payment_id == payment_id))
        if found is not None:
            return found
    payment_details = obj.get("payment_details")
    if isinstance(payment_details, dict) and payment_details.get("id"):
        found = await session.scalar(
            select(Invoice).where(Invoice.yookassa_payment_id == str(payment_details["id"]))
        )
        if found is not None:
            return found
    return None


def _allowed_ip(host: str) -> bool:
    if not host or host in {"local", "proxy", "testclient"}:
        return False
    try:
        address = ipaddress.ip_address(host)
    except ValueError:
        return False
    if address in _YOOKASSA_HOSTS:
        return True
    return any(address in network for network in _YOOKASSA_NETS)
