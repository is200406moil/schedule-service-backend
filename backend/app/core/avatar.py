from __future__ import annotations

import base64
import binascii

MAX_AVATAR_BYTES = 2 * 1024 * 1024
ALLOWED_AVATAR_TYPES = {"image/jpeg", "image/png", "image/webp"}


class AvatarValidationError(ValueError):
    pass


def _matches_file_signature(content_type: str, raw: bytes) -> bool:
    if content_type == "image/jpeg":
        return raw.startswith(b"\xff\xd8\xff")
    if content_type == "image/png":
        return raw.startswith(b"\x89PNG\r\n\x1a\n")
    if content_type == "image/webp":
        return len(raw) >= 12 and raw[:4] == b"RIFF" and raw[8:12] == b"WEBP"
    return False


def encode_avatar(content_type: str | None, raw: bytes) -> str:
    normalized_type = (content_type or "").lower()
    if normalized_type not in ALLOWED_AVATAR_TYPES:
        raise AvatarValidationError("Avatar must be a JPEG, PNG, or WebP image")
    if not raw:
        raise AvatarValidationError("Avatar file is empty")
    if len(raw) > MAX_AVATAR_BYTES:
        raise AvatarValidationError("Avatar must not exceed 2 MB")
    if not _matches_file_signature(normalized_type, raw):
        raise AvatarValidationError("Avatar content does not match its image type")
    encoded = base64.b64encode(raw).decode("ascii")
    return f"data:{normalized_type};base64,{encoded}"


def validate_avatar_data_url(value: str | None) -> str | None:
    if value is None:
        return None
    try:
        header, encoded = value.split(",", 1)
        content_type, encoding = header.removeprefix("data:").split(";", 1)
    except ValueError as exc:
        raise AvatarValidationError("Avatar must be a base64 data URL") from exc
    if not header.startswith("data:") or encoding.lower() != "base64":
        raise AvatarValidationError("Avatar must be a base64 data URL")
    max_encoded_length = ((MAX_AVATAR_BYTES + 2) // 3) * 4
    if len(encoded) > max_encoded_length:
        raise AvatarValidationError("Avatar must not exceed 2 MB")
    try:
        raw = base64.b64decode(encoded, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise AvatarValidationError("Avatar contains invalid base64 data") from exc
    return encode_avatar(content_type, raw)
