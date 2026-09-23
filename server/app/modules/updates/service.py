from __future__ import annotations

import os
import time
from dataclasses import dataclass
from pathlib import Path

import httpx

from app.core.config import get_settings
from app.core.errors import AppError
from app.modules.updates.schemas import UpdateStatus

_CACHE_TTL = 60.0


@dataclass(frozen=True)
class Latest:
    sha: str
    message: str
    date: str


_latest_cache: tuple[float, Latest | None, bool] | None = None


def clear_cache() -> None:
    global _latest_cache
    _latest_cache = None


def same_sha(left: str, right: str) -> bool:
    a = left.strip().lower()
    b = right.strip().lower()
    if not a or not b or a == "unknown" or b == "unknown":
        return False
    return a == b or a.startswith(b) or b.startswith(a)


def can_apply() -> bool:
    settings = get_settings()
    if not settings.update_apply:
        return False
    path = settings.update_request.strip()
    if not path:
        return False
    parent = Path(path).parent
    if not parent.exists():
        try:
            parent.mkdir(parents=True, exist_ok=True)
        except OSError:
            return False
    return os.access(parent, os.W_OK)


async def fetch_latest() -> Latest:
    settings = get_settings()
    url = f"https://api.github.com/repos/{settings.github_repo}/commits/{settings.github_branch}"
    async with httpx.AsyncClient(timeout=12.0) as client:
        response = await client.get(
            url,
            headers={
                "Accept": "application/vnd.github+json",
                "User-Agent": "bchat-update",
            },
        )
    if response.status_code != 200:
        raise AppError(502, "update_github")
    data = response.json()
    sha = str(data.get("sha") or "")
    if len(sha) < 7:
        raise AppError(502, "update_github")
    commit = data.get("commit") if isinstance(data.get("commit"), dict) else {}
    message = str(commit.get("message") or "").split("\n", 1)[0].strip()[:200]
    committer = commit.get("committer") if isinstance(commit.get("committer"), dict) else {}
    date = str(committer.get("date") or "")
    return Latest(sha=sha, message=message, date=date)


async def _cached_latest() -> tuple[Latest | None, bool]:
    global _latest_cache
    now = time.monotonic()
    if _latest_cache is not None and now - _latest_cache[0] < _CACHE_TTL:
        return _latest_cache[1], _latest_cache[2]
    try:
        latest = await fetch_latest()
        _latest_cache = (now, latest, True)
        return latest, True
    except AppError:
        _latest_cache = (now, None, False)
        return None, False


async def status() -> UpdateStatus:
    settings = get_settings()
    latest, github_ok = await _cached_latest()
    current = settings.git_sha.strip() or "unknown"
    available = False
    if latest is not None and github_ok:
        available = not same_sha(current, latest.sha)
    return UpdateStatus(
        current=current,
        latest=latest.sha if latest else None,
        message=latest.message if latest else "",
        date=latest.date if latest else "",
        available=available,
        can_apply=can_apply(),
        github_ok=github_ok,
    )


def request_update(available: bool) -> None:
    if not can_apply():
        raise AppError(409, "update_unavailable")
    if not available:
        raise AppError(409, "update_current")
    path = Path(get_settings().update_request.strip())
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(f"{time.time():.0f}\n", encoding="utf-8")
