import time


class RateLimiter:
    def __init__(self) -> None:
        self._hits: dict[str, list[float]] = {}

    def allow(self, key: str, limit: int, window_seconds: float) -> bool:
        from app.core.config import get_settings

        if not get_settings().rate_limit_enabled:
            return True
        now = time.monotonic()
        hits = [item for item in self._hits.get(key, []) if now - item < window_seconds]
        if len(hits) >= limit:
            self._hits[key] = hits
            return False
        hits.append(now)
        self._hits[key] = hits
        return True

    def clear(self) -> None:
        self._hits.clear()


login_limiter = RateLimiter()
message_limiter = RateLimiter()
upload_limiter = RateLimiter()
