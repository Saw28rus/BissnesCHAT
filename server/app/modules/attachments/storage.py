import shutil
import uuid
from pathlib import Path

from app.core.config import get_settings
from app.core.errors import AppError


def ensure_space() -> None:
    settings = get_settings()
    settings.upload_dir.mkdir(parents=True, exist_ok=True)
    free = shutil.disk_usage(settings.upload_dir).free
    if free < settings.disk_min_free_bytes:
        raise AppError(507, "disk_full")


def write_bytes(data: bytes, extension: str) -> str:
    settings = get_settings()
    settings.upload_dir.mkdir(parents=True, exist_ok=True)
    stored_name = f"{uuid.uuid4().hex}{extension}"
    target = settings.upload_dir / stored_name
    target.write_bytes(data)
    return stored_name


def resolve_stored(stored_name: str) -> Path:
    settings = get_settings()
    root = settings.upload_dir.resolve()
    path = (settings.upload_dir / stored_name).resolve()
    if root != path and root not in path.parents:
        raise AppError(404, "not_found")
    if not path.is_file():
        raise AppError(404, "not_found")
    return path


def remove_stored(names: list[str]) -> None:
    settings = get_settings()
    root = settings.upload_dir.resolve()
    for name in names:
        path = (settings.upload_dir / name).resolve()
        if root == path or root not in path.parents:
            continue
        path.unlink(missing_ok=True)


def disk_report() -> dict:
    settings = get_settings()
    settings.upload_dir.mkdir(parents=True, exist_ok=True)
    usage = shutil.disk_usage(settings.upload_dir)
    upload_bytes = 0
    for item in settings.upload_dir.iterdir():
        if item.is_file():
            upload_bytes += item.stat().st_size
    return {
        "free_bytes": usage.free,
        "upload_bytes": upload_bytes,
        "uploads_blocked": usage.free < settings.disk_min_free_bytes,
    }
