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


class RecoveryRateLimiter:
    """Atomic process-local limiter; a full key store rejects new keys until expiry.

    Multi-worker deployments need a shared limiter at the trusted ingress as well.
    Unlike the login limiter, successful requests count and flooding never evicts keys.
    """

    def __init__(
        self, max_attempts: int, window_seconds: int, max_tracked_keys: int = 10_000
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

    def consume(self, key: str) -> int | None:
        with self._lock:
            now = time.monotonic()
            attempts = self._attempts.get(key)
            if attempts is not None:
                self._prune(attempts, now)
            if attempts is None and len(self._attempts) >= self.max_tracked_keys:
                for tracked_key in list(self._attempts):
                    tracked_attempts = self._attempts[tracked_key]
                    self._prune(tracked_attempts, now)
                    if not tracked_attempts:
                        del self._attempts[tracked_key]
                if len(self._attempts) >= self.max_tracked_keys:
                    return self.window_seconds
            if attempts is None:
                attempts = self._attempts.setdefault(key, deque())
            if len(attempts) >= self.max_attempts:
                return max(1, math.ceil(self.window_seconds - (now - attempts[0])))
            attempts.append(now)
            return None

    def reset(self, key: str) -> None:
        with self._lock:
            self._attempts.pop(key, None)

    def clear(self) -> None:
        with self._lock:
            self._attempts.clear()


recovery_request_limiter = RecoveryRateLimiter(max_attempts=10, window_seconds=600)
recovery_address_limiter = RecoveryRateLimiter(max_attempts=3, window_seconds=1800)
recovery_confirm_limiter = RecoveryRateLimiter(max_attempts=20, window_seconds=600)
verification_request_limiter = RecoveryRateLimiter(max_attempts=10, window_seconds=600)
verification_address_limiter = RecoveryRateLimiter(max_attempts=3, window_seconds=1800)
verification_confirm_limiter = RecoveryRateLimiter(max_attempts=20, window_seconds=600)


def recovery_client_key(request: Request) -> str:
    # Forwarded headers are not trusted here; configure trusted proxies in the server.
    return request.client.host if request.client else "unknown"


def get_recovery_request_retry_after(request: Request) -> int | None:
    if hasattr(request.state, "recovery_retry_after"):
        return request.state.recovery_retry_after
    return recovery_request_limiter.consume(recovery_client_key(request))


def get_recovery_confirm_retry_after(request: Request) -> int | None:
    if hasattr(request.state, "recovery_retry_after"):
        return request.state.recovery_retry_after
    return recovery_confirm_limiter.consume(recovery_client_key(request))


def require_recovery_request_rate(request: Request) -> None:
    retry_after = get_recovery_request_retry_after(request)
    if retry_after is not None:
        raise HTTPException(429, detail="rate", headers={"Retry-After": str(retry_after)})


def require_recovery_confirm_rate(request: Request) -> None:
    retry_after = get_recovery_confirm_retry_after(request)
    if retry_after is not None:
        raise HTTPException(429, detail="rate", headers={"Retry-After": str(retry_after)})


def get_verification_request_retry_after(request: Request) -> int | None:
    if hasattr(request.state, "verification_retry_after"):
        return request.state.verification_retry_after
    return verification_request_limiter.consume(recovery_client_key(request))


def get_verification_confirm_retry_after(request: Request) -> int | None:
    if hasattr(request.state, "verification_retry_after"):
        return request.state.verification_retry_after
    return verification_confirm_limiter.consume(recovery_client_key(request))


def require_verification_request_rate(request: Request) -> None:
    retry_after = get_verification_request_retry_after(request)
    if retry_after is not None:
        raise HTTPException(429, detail="rate", headers={"Retry-After": str(retry_after)})


def require_verification_confirm_rate(request: Request) -> None:
    retry_after = get_verification_confirm_retry_after(request)
    if retry_after is not None:
        raise HTTPException(429, detail="rate", headers={"Retry-After": str(retry_after)})
