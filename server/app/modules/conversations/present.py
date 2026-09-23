from datetime import UTC, datetime

from app.modules.attachments.models import Attachment
from app.modules.conversations.models import Message


def iso(value: datetime | None) -> str | None:
    if value is None:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=UTC)
    return value.isoformat()


def present_message(
    message: Message,
    attachment: Attachment | None = None,
    invoice: dict | None = None,
) -> dict:
    deleted = message.deleted_at is not None
    payload = {
        "id": str(message.id),
        "conversation_id": str(message.conversation_id),
        "sender_id": str(message.sender_id),
        "type": message.type,
        "body": "" if deleted else message.body,
        "reply_to_id": str(message.reply_to_id) if message.reply_to_id else None,
        "reply_quote": message.reply_quote,
        "created_at": iso(message.created_at),
        "edited_at": iso(message.edited_at),
        "deleted_at": iso(message.deleted_at),
        "updated_at": iso(message.updated_at),
        "client_nonce": str(message.client_nonce) if message.client_nonce else None,
        "attachment": None,
        "invoice": None if deleted else invoice,
    }
    if attachment is not None and not deleted:
        payload["attachment"] = {
            "id": str(attachment.id),
            "name": attachment.original_name,
            "content_type": attachment.content_type,
            "size": attachment.size,
            "duration_sec": attachment.duration_sec,
        }
    return payload
