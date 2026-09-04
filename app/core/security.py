from datetime import UTC, datetime, timedelta

from joserfc import jwt
from joserfc.errors import JoseError
from joserfc.jwk import OctKey
from joserfc.jwt import JWTClaimsRegistry
from pwdlib import PasswordHash

pwd_context: PasswordHash = PasswordHash.recommended()
ALGORITHM = "HS256"
_REQUIRED_CLAIMS = JWTClaimsRegistry(
    sub={"essential": True},
    iat={"essential": True},
    exp={"essential": True},
)


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain_password: str, password_hash: str) -> bool:
    return pwd_context.verify(plain_password, password_hash)


def create_access_token(*, subject: str, secret_key: str, expires_minutes: int) -> str:
    issued_at = datetime.now(UTC)
    payload = {
        "sub": subject,
        "iat": issued_at,
        "exp": issued_at + timedelta(minutes=expires_minutes),
    }
    return jwt.encode(
        {"alg": ALGORITHM},
        payload,
        OctKey.import_key(secret_key),
        algorithms=[ALGORITHM],
    )


def decode_access_token(token: str, secret_key: str) -> dict:
    decoded = jwt.decode(
        token,
        OctKey.import_key(secret_key),
        algorithms=[ALGORITHM],
    )
    _REQUIRED_CLAIMS.validate(decoded.claims)
    return decoded.claims


class TokenDecodeError(ValueError):
    pass


def get_token_subject(token: str, secret_key: str) -> str:
    try:
        payload = decode_access_token(token, secret_key)
    except JoseError as exc:
        raise TokenDecodeError(str(exc)) from exc
    sub = payload.get("sub")
    if sub is None:
        raise TokenDecodeError("missing subject")
    return str(sub)
