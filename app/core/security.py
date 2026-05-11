from datetime import datetime, timedelta, timezone

from jose import JWTError, jwt
# from passlib.context import CryptContext
from pwdlib import PasswordHash

# pwd_context = PasswordHash.from_string("argon2")
pwd_context: PasswordHash = PasswordHash.recommended()
ALGORITHM = "HS256"


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain_password: str, password_hash: str) -> bool:
    return pwd_context.verify(plain_password, password_hash)


def create_access_token(*, subject: str, secret_key: str, expires_minutes: int) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=expires_minutes)
    payload = {"sub": subject, "exp": expire}
    return jwt.encode(payload, secret_key, algorithm=ALGORITHM)


def decode_access_token(token: str, secret_key: str) -> dict:
    return jwt.decode(token, secret_key, algorithms=[ALGORITHM])


class TokenDecodeError(ValueError):
    pass


def get_token_subject(token: str, secret_key: str) -> str:
    try:
        payload = decode_access_token(token, secret_key)
    except JWTError as exc:
        raise TokenDecodeError(str(exc)) from exc
    sub = payload.get("sub")
    if sub is None:
        raise TokenDecodeError("missing subject")
    return str(sub)
