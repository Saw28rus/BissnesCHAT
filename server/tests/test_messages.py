import uuid
from datetime import timedelta

from tests.helpers import auth_header, login

from app.core.db import get_sessionmaker
from app.core.security import utcnow
from app.modules.conversations.models import Message


async def _client(client, login_name: str, password: str = "clientpass12"):
    assert (await login(client, "admin", "adminpassword1")).status_code == 200
    headers = await auth_header(client)
    created = await client.post(
        "/api/accounts",
        json={"display_name": login_name, "login": login_name, "password": password},
        headers=headers,
    )
    assert created.status_code == 201, created.text
    await client.post("/api/auth/logout", headers=await auth_header(client))
    assert (await login(client, login_name, password)).status_code == 200
    me = await client.get("/api/auth/me")
    return me.json()


async def test_clients_are_isolated(client):
    first = await _client(client, "client.one")
    await client.post("/api/auth/logout", headers=await auth_header(client))
    second = await _client(client, "client.two")
    foreign = await client.get(f"/api/conversations/{first['conversation_id']}/messages")
    assert foreign.status_code == 404
    listing = await client.get("/api/accounts")
    assert listing.status_code == 404
    sent = await client.post(
        f"/api/conversations/{second['conversation_id']}/messages",
        json={"body": "только мой диалог", "client_nonce": str(uuid.uuid4())},
        headers=await auth_header(client),
    )
    assert sent.status_code == 201
    await client.post("/api/auth/logout", headers=await auth_header(client))
    assert (await login(client, "client.one", "clientpass12")).status_code == 200
    leaked = await client.get(f"/api/conversations/{second['conversation_id']}/messages")
    assert leaked.status_code == 404


async def test_edit_delete_reply_and_idempotency(client):
    account = await _client(client, "writer")
    conversation_id = account["conversation_id"]
    nonce = str(uuid.uuid4())
    headers = await auth_header(client)
    first = await client.post(
        f"/api/conversations/{conversation_id}/messages",
        json={"body": "черновик", "client_nonce": nonce},
        headers=headers,
    )
    again = await client.post(
        f"/api/conversations/{conversation_id}/messages",
        json={"body": "другой текст", "client_nonce": nonce},
        headers=await auth_header(client),
    )
    assert first.status_code == 201
    assert again.status_code == 201
    assert again.json()["id"] == first.json()["id"]
    assert again.json()["body"] == "черновик"
    assert again.json()["client_nonce"] == nonce
    reply = await client.post(
        f"/api/conversations/{conversation_id}/messages",
        json={
            "body": "ответ",
            "reply_to_id": first.json()["id"],
            "reply_quote": "поддельная цитата",
        },
        headers=await auth_header(client),
    )
    assert reply.status_code == 201
    assert reply.json()["reply_quote"] == "черновик"
    edited = await client.patch(
        f"/api/messages/{first.json()['id']}",
        json={"body": "чистовик"},
        headers=await auth_header(client),
    )
    assert edited.status_code == 200
    assert edited.json()["edited_at"] is not None
    deleted = await client.delete(
        f"/api/messages/{first.json()['id']}",
        headers=await auth_header(client),
    )
    assert deleted.status_code == 200
    assert deleted.json()["body"] == ""
    listed = await client.get(f"/api/conversations/{conversation_id}/messages")
    reply_row = next(item for item in listed.json()["messages"] if item["id"] == reply.json()["id"])
    assert reply_row["reply_quote"] == "Сообщение удалено"


async def test_cannot_edit_foreign_message_or_cross_reply(client):
    first = await _client(client, "owner")
    await client.post("/api/auth/logout", headers=await auth_header(client))
    assert (await login(client, "admin", "adminpassword1")).status_code == 200
    admin_message = await client.post(
        f"/api/conversations/{first['conversation_id']}/messages",
        json={"body": "от администратора"},
        headers=await auth_header(client),
    )
    assert admin_message.status_code == 201
    await client.post("/api/auth/logout", headers=await auth_header(client))
    second = await _client(client, "other")
    forbidden = await client.patch(
        f"/api/messages/{admin_message.json()['id']}",
        json={"body": "взлом"},
        headers=await auth_header(client),
    )
    assert forbidden.status_code == 404
    cross = await client.post(
        f"/api/conversations/{second['conversation_id']}/messages",
        json={"body": "чужая цитата", "reply_to_id": admin_message.json()["id"]},
        headers=await auth_header(client),
    )
    assert cross.status_code == 404


async def test_sync_sees_edit_after_cursor(client):
    account = await _client(client, "syncer")
    created = await client.post(
        f"/api/conversations/{account['conversation_id']}/messages",
        json={"body": "до правки"},
        headers=await auth_header(client),
    )
    moment = created.json()["updated_at"]
    await client.patch(
        f"/api/messages/{created.json()['id']}",
        json={"body": "после правки"},
        headers=await auth_header(client),
    )
    synced = await client.get(
        f"/api/conversations/{account['conversation_id']}/sync",
        params={"since": moment},
    )
    assert synced.status_code == 200
    assert synced.json()["messages"][0]["body"] == "после правки"


async def test_file_is_private(client):
    account = await _client(client, "filer")
    payload = b"%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF"
    uploaded = await client.post(
        f"/api/conversations/{account['conversation_id']}/files",
        data={"kind": "file"},
        files={"upload": ("note.pdf", payload, "application/pdf")},
        headers=await auth_header(client),
    )
    assert uploaded.status_code == 201, uploaded.text
    attachment_id = uploaded.json()["attachment"]["id"]
    own = await client.get(f"/api/attachments/{attachment_id}")
    assert own.status_code == 200
    assert "attachment" in own.headers["content-disposition"].lower()
    await client.post("/api/auth/logout", headers=await auth_header(client))
    guest = await client.get(f"/api/attachments/{attachment_id}")
    assert guest.status_code == 401
    intruder = await _client(client, "intruder")
    foreign = await client.get(f"/api/attachments/{attachment_id}")
    assert foreign.status_code == 404
    rejected = await client.post(
        f"/api/conversations/{intruder['conversation_id']}/files",
        data={"kind": "file"},
        files={"upload": ("page.html", b"<html></html>", "text/html")},
        headers=await auth_header(client),
    )
    assert rejected.status_code == 400
    assert rejected.json()["error"] == "file_type"


async def test_backup_roundtrip_skips_old_voice_and_deleted(client):
    account = await _client(client, "backup")
    conversation_id = account["conversation_id"]
    fresh = await client.post(
        f"/api/conversations/{conversation_id}/messages",
        json={"body": "свежее письмо"},
        headers=await auth_header(client),
    )
    old = await client.post(
        f"/api/conversations/{conversation_id}/messages",
        json={"body": "старое письмо"},
        headers=await auth_header(client),
    )
    voice = await client.post(
        f"/api/conversations/{conversation_id}/files",
        data={"kind": "voice", "duration_sec": "3"},
        files={"upload": ("voice.webm", b"\x1a\x45\xdf\xa3" + b"\x00" * 16, "audio/webm")},
        headers=await auth_header(client),
    )
    assert voice.status_code == 201, voice.text
    doomed = await client.post(
        f"/api/conversations/{conversation_id}/messages",
        json={"body": "это удалят"},
        headers=await auth_header(client),
    )
    await client.delete(f"/api/messages/{doomed.json()['id']}", headers=await auth_header(client))
    async with get_sessionmaker()() as session:
        row = await session.get(Message, uuid.UUID(old.json()["id"]))
        row.created_at = utcnow() - timedelta(days=3)
        row.updated_at = row.created_at
        await session.commit()
    await client.post("/api/auth/logout", headers=await auth_header(client))
    assert (await login(client, "admin", "adminpassword1")).status_code == 200
    exported = await client.post(
        "/api/backup/export",
        data={"password": "backup-password", "include_messages": "true"},
        headers=await auth_header(client),
    )
    assert exported.status_code == 200
    from app.modules.backup.crypto import decrypt_backup

    document = decrypt_backup("backup-password", exported.content)
    text = document.decode()
    assert "свежее письмо" in text
    assert "старое письмо" not in text
    assert "это удалят" not in text
    assert "voice.webm" not in text
    assert "$argon2" in text
    preview = await client.post(
        "/api/backup/preview",
        data={"password": "backup-password"},
        files={"upload": ("bchat-backup.bin", exported.content, "application/octet-stream")},
        headers=await auth_header(client),
    )
    assert preview.status_code == 200, preview.text
    assert preview.json()["messages"] == 1
    assert preview.json()["passwords_replaced"] == 1
    removed = await client.delete(f"/api/accounts/{account['id']}", headers=await auth_header(client))
    assert removed.status_code == 204, removed.text
    preview = await client.post(
        "/api/backup/preview",
        data={"password": "backup-password"},
        files={"upload": ("bchat-backup.bin", exported.content, "application/octet-stream")},
        headers=await auth_header(client),
    )
    assert preview.status_code == 200, preview.text
    assert preview.json()["passwords_replaced"] == 0
    restored = await client.post(
        "/api/backup/restore",
        json={"preview_id": preview.json()["preview_id"]},
        headers=await auth_header(client),
    )
    assert restored.status_code == 200, restored.text
    assert restored.json()["created"] == 1
    assert restored.json()["messages"] == 1
    await client.post("/api/auth/logout", headers=await auth_header(client))
    assert (await login(client, "backup", "clientpass12")).status_code == 200
    restored_me = (await client.get("/api/auth/me")).json()
    history = await client.get(f"/api/conversations/{restored_me['conversation_id']}/messages")
    assert any(item["body"] == "свежее письмо" for item in history.json()["messages"])
    await client.post("/api/auth/logout", headers=await auth_header(client))
    assert (await login(client, "admin", "adminpassword1")).status_code == 200
    again = await client.post(
        "/api/backup/preview",
        data={"password": "backup-password"},
        files={"upload": ("bchat-backup.bin", exported.content, "application/octet-stream")},
        headers=await auth_header(client),
    )
    second = await client.post(
        "/api/backup/restore",
        json={"preview_id": again.json()["preview_id"]},
        headers=await auth_header(client),
    )
    assert second.json()["messages"] == 0
    bad = await client.post(
        "/api/backup/preview",
        data={"password": "wrong-password-here"},
        files={"upload": ("bchat-backup.bin", exported.content, "application/octet-stream")},
        headers=await auth_header(client),
    )
    assert bad.status_code == 400
    await client.post("/api/auth/logout", headers=await auth_header(client))
    denied = await login(client, "backup", "clientpass12")
    assert denied.status_code == 200
    hidden = await client.post(
        "/api/backup/export",
        data={"password": "backup-password", "include_messages": "true"},
        headers=await auth_header(client),
    )
    assert hidden.status_code == 404


async def test_block_and_password_reset(client):
    account = await _client(client, "forgetful")
    await client.post("/api/auth/logout", headers=await auth_header(client))
    assert (await login(client, "admin", "adminpassword1")).status_code == 200
    changed = await client.post(
        f"/api/accounts/{account['id']}/password",
        json={"password": "replacement1"},
        headers=await auth_header(client),
    )
    assert changed.status_code == 200
    await client.post("/api/auth/logout", headers=await auth_header(client))
    assert (await login(client, "forgetful", "clientpass12")).status_code == 401
    assert (await login(client, "Forgetful", "replacement1")).status_code == 200
    await client.post("/api/auth/logout", headers=await auth_header(client))
    assert (await login(client, "admin", "adminpassword1")).status_code == 200
    blocked = await client.post(
        f"/api/accounts/{account['id']}/block",
        headers=await auth_header(client),
    )
    assert blocked.status_code == 200
    await client.post("/api/auth/logout", headers=await auth_header(client))
    refused = await login(client, "forgetful", "replacement1")
    assert refused.status_code == 403
    assert refused.json()["error"] == "blocked"
