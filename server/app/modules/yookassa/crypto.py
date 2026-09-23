import hashlib
import os

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from app.core.config import get_settings
from app.core.errors import AppError

_MAGIC = b"YK1"
_AAD = b"bchat-yookassa-v1"


def encrypt_secret(plain: str) -> bytes:
    nonce = os.urandom(12)
    ciphertext = AESGCM(_key()).encrypt(nonce, plain.encode("utf-8"), _AAD)
    return _MAGIC + nonce + ciphertext


def decrypt_secret(blob: bytes) -> str:
    if len(blob) < len(_MAGIC) + 12 + 16 or not blob.startswith(_MAGIC):
        raise AppError(500, "server_error")
    nonce = blob[len(_MAGIC) : len(_MAGIC) + 12]
    ciphertext = blob[len(_MAGIC) + 12 :]
    try:
        return AESGCM(_key()).decrypt(nonce, ciphertext, _AAD).decode("utf-8")
    except Exception as exc:
        raise AppError(500, "server_error") from exc


def secret_hint(plain: str) -> str:
    tail = plain[-4:] if len(plain) >= 4 else plain
    return f"••••{tail}"


def _key() -> bytes:
    return hashlib.sha256(get_settings().secret_key.encode("utf-8")).digest()
