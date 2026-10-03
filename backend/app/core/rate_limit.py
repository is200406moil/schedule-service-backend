from __future__ import annotations

import math
import threading
import time
from collections import deque

from fastapi import HTTPException, Request, status

from app.core.config import settings


class LoginRateLimiter:
    def __init__(
        self,
        max_attempts: int,
        window_seconds: int,
        max_tracked_keys: int = 10_000,
    ) -> None:
        self.max_attempts = max_attempts
        self.window_seconds = window_seconds
        self.max_tracked_keys = max_tracked_keys
        self._attempts: dict[str, deque[float]] = {}
        self._lock = threading.Lock()

    def _prune(self, attempts: deque[float], now: float) -> None:
        threshold = now - self.window_seconds
        while attempts and attempts[0] <= threshold:
            attempts.popleft()

    def retry_after(self, key: str) -> int | None:
        now = time.monotonic()
        with self._lock:
            attempts = self._attempts.get(key)
            if attempts is None:
                return None
            self._prune(attempts, now)
            if not attempts:
                self._attempts.pop(key, None)
                return None
            if len(attempts) < self.max_attempts:
                return None
            return max(1, math.ceil(self.window_seconds - (now - attempts[0])))

    def record_failure(self, key: str) -> int | None:
        now = time.monotonic()
        with self._lock:
            if key not in self._attempts and len(self._attempts) >= self.max_tracked_keys:
                self._attempts.pop(next(iter(self._attempts)))
            attempts = self._attempts.setdefault(key, deque())
            self._prune(attempts, now)
            attempts.append(now)
            if len(attempts) < self.max_attempts:
                return None
            return max(1, math.ceil(self.window_seconds - (now - attempts[0])))

    def reset(self, key: str) -> None:
        with self._lock:
            self._attempts.pop(key, None)


def login_rate_limit_key(request: Request, email: str) -> str:
    client_host = request.client.host if request.client else "unknown"
    return f"{client_host}:{email.strip().lower()}"


def raise_rate_limit(retry_after: int) -> None:
    raise HTTPException(
        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
        detail="Too many login attempts. Try again later.",
        headers={"Retry-After": str(retry_after)},
    )


login_rate_limiter = LoginRateLimiter(
    max_attempts=settings.login_rate_limit_attempts,
    window_seconds=settings.login_rate_limit_window_seconds,
)
