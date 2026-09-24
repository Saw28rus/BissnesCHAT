import re
from pathlib import Path

from app.core.errors import AppError
from app.modules.attachments.image import photo_dimensions, sane_photo

_MAX_DOCUMENT = 20 * 1024 * 1024
_MAX_PHOTO = 5 * 1024 * 1024
_MAX_VOICE = 8 * 1024 * 1024
_OFFICE_DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
_OFFICE_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


def clean_filename(name: str) -> str:
    base = Path(name.replace("\\", "/")).name
    base = re.sub(r"[\x00-\x1f]", "", base).strip()
    if not base or base in {".", ".."}:
        return "file"
    return base[:120]


def sniff(data: bytes, filename: str, kind: str) -> tuple[str, str]:
    if not data:
        raise AppError(400, "empty_file")
    ext = Path(filename).suffix.lower()
    if kind == "voice":
        detected = _voice(data, ext)
        limit = _MAX_VOICE
    else:
        detected = _document(data, ext)
        limit = _MAX_PHOTO if detected and detected[0].startswith("image/") else _MAX_DOCUMENT
    if detected is None:
        raise AppError(400, "file_type")
    if len(data) > limit:
        raise AppError(413, "payload_too_large")
    return detected


def _photo(data: bytes, content_type: str, extension: str) -> tuple[str, str] | None:
    size = photo_dimensions(data, content_type)
    if size is None or not sane_photo(*size):
        return None
    return content_type, extension


def _document(data: bytes, ext: str) -> tuple[str, str] | None:
    if data.startswith(b"%PDF") and ext == ".pdf":
        return "application/pdf", ".pdf"
    if data.startswith(b"\xff\xd8\xff"):
        return _photo(data, "image/jpeg", ".jpg")
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return _photo(data, "image/png", ".png")
    if len(data) >= 12 and data.startswith(b"RIFF") and data[8:12] == b"WEBP":
        return _photo(data, "image/webp", ".webp")
    if data.startswith(b"\xd0\xcf\x11\xe0") and ext == ".doc":
        return "application/msword", ".doc"
    if data.startswith(b"PK\x03\x04") and ext == ".docx":
        return _OFFICE_DOCX, ".docx"
    if data.startswith(b"PK\x03\x04") and ext == ".xlsx":
        return _OFFICE_XLSX, ".xlsx"
    if ext == ".txt" and _plain_text(data):
        return "text/plain", ".txt"
    return None


def _voice(data: bytes, ext: str) -> tuple[str, str] | None:
    if data.startswith(b"\x1a\x45\xdf\xa3") and ext == ".webm":
        return "audio/webm", ".webm"
    if len(data) > 12 and data[4:8] == b"ftyp" and ext == ".mp4":
        return "audio/mp4", ".mp4"
    return None


def _plain_text(data: bytes) -> bool:
    if b"\x00" in data:
        return False
    try:
        data.decode("utf-8")
    except UnicodeDecodeError:
        return False
    return True
