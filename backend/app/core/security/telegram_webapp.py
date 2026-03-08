import hashlib
import hmac
import json
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any
from urllib.parse import parse_qsl

from fastapi import status

from app.core.errors import ApiException


@dataclass(slots=True)
class TelegramUserPayload:
    id: int
    first_name: str
    last_name: str | None = None
    username: str | None = None
    language_code: str | None = None
    photo_url: str | None = None
    is_premium: bool = False


@dataclass(slots=True)
class TelegramAuthPayload:
    auth_date: datetime | None
    query_id: str | None
    chat_instance: str | None
    chat_type: str | None
    user: TelegramUserPayload


def _parse_init_data(init_data: str) -> dict[str, str]:
    parsed_items = parse_qsl(init_data, keep_blank_values=True, strict_parsing=True)
    return {key: value for key, value in parsed_items}


def _build_data_check_string(data: dict[str, str]) -> str:
    return "\n".join(f"{key}={value}" for key, value in sorted(data.items()))


def _secret_key(bot_token: str) -> bytes:
    return hmac.new(
        key=b"WebAppData",
        msg=bot_token.encode("utf-8"),
        digestmod=hashlib.sha256,
    ).digest()


def validate_init_data(
    init_data: str,
    *,
    bot_token: str,
    allowed_clock_skew_seconds: int,
    now: datetime | None = None,
) -> TelegramAuthPayload:
    if not init_data:
        raise ApiException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            code="missing_init_data",
            message="Telegram init data header is required.",
        )

    parsed = _parse_init_data(init_data)
    received_hash = parsed.pop("hash", None)
    if not received_hash:
        raise ApiException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            code="missing_hash",
            message="Telegram init data hash is missing.",
        )

    check_string = _build_data_check_string(parsed)
    calculated_hash = hmac.new(
        key=_secret_key(bot_token),
        msg=check_string.encode("utf-8"),
        digestmod=hashlib.sha256,
    ).hexdigest()

    if not hmac.compare_digest(calculated_hash, received_hash):
        raise ApiException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            code="invalid_hash",
            message="Telegram init data hash validation failed.",
        )

    auth_date_raw = parsed.get("auth_date")
    auth_date = None
    if auth_date_raw:
        auth_date = datetime.fromtimestamp(int(auth_date_raw), tz=UTC)
        current_time = now or datetime.now(tz=UTC)
        drift = abs((current_time - auth_date).total_seconds())
        if drift > allowed_clock_skew_seconds:
            raise ApiException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                code="expired_init_data",
                message="Telegram init data is too old.",
                details={"allowed_clock_skew_seconds": allowed_clock_skew_seconds},
            )

    user_raw = parsed.get("user")
    if not user_raw:
        raise ApiException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            code="missing_user",
            message="Telegram init data user payload is missing.",
        )

    try:
        user_json: dict[str, Any] = json.loads(user_raw)
    except json.JSONDecodeError as exc:
        raise ApiException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            code="invalid_user_payload",
            message="Telegram user payload is invalid JSON.",
        ) from exc

    user = TelegramUserPayload(
        id=int(user_json["id"]),
        first_name=str(user_json.get("first_name", "")),
        last_name=user_json.get("last_name"),
        username=user_json.get("username"),
        language_code=user_json.get("language_code"),
        photo_url=user_json.get("photo_url"),
        is_premium=bool(user_json.get("is_premium", False)),
    )

    return TelegramAuthPayload(
        auth_date=auth_date,
        query_id=parsed.get("query_id"),
        chat_instance=parsed.get("chat_instance"),
        chat_type=parsed.get("chat_type"),
        user=user,
    )

