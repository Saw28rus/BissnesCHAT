import os

from argon2.low_level import Type, hash_secret_raw
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from app.core.errors import AppError

_MAGIC = b"BCHAT1"
_AAD = b"bchat-backup-v1"


def encrypt_backup(password: str, payload: bytes) -> bytes:
    salt = os.urandom(16)
    nonce = os.urandom(12)
    key = _key(password, salt)
    ciphertext = AESGCM(key).encrypt(nonce, payload, _AAD)
    return _MAGIC + salt + nonce + ciphertext


def decrypt_backup(password: str, blob: bytes) -> bytes:
    if len(blob) < len(_MAGIC) + 16 + 12 + 16 or not blob.startswith(_MAGIC):
        raise AppError(400, "invalid_backup")
    salt = blob[len(_MAGIC) : len(_MAGIC) + 16]
    nonce = blob[len(_MAGIC) + 16 : len(_MAGIC) + 28]
    ciphertext = blob[len(_MAGIC) + 28 :]
    try:
        return AESGCM(_key(password, salt)).decrypt(nonce, ciphertext, _AAD)
    except Exception as exc:
        raise AppError(400, "invalid_backup_password") from exc


def _key(password: str, salt: bytes) -> bytes:
    from app.core.config import get_settings

    testing = get_settings().environment == "test"
    return hash_secret_raw(
        secret=password.encode("utf-8"),
        salt=salt,
        time_cost=1 if testing else 2,
        memory_cost=1024 if testing else 65536,
        parallelism=1,
        hash_len=32,
        type=Type.ID,
    )
