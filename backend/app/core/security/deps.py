from contextlib import asynccontextmanager
from dataclasses import dataclass

from fastapi import Depends, Header, status
from sqlalchemy import select, text
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings, get_settings
from app.core.errors import ApiException
from app.core.security.telegram_webapp import TelegramAuthPayload, TelegramUserPayload, validate_init_data
from app.db.models.user import User
from app.db.session import get_db_session


@dataclass(slots=True)
class AuthPrincipal:
    source: str
    payload: TelegramAuthPayload


async def get_auth_principal(
    x_telegram_init_data: str | None = Header(default=None, alias="X-Telegram-Init-Data"),
    settings: Settings = Depends(get_settings),
) -> AuthPrincipal:
    if x_telegram_init_data:
        payload = validate_init_data(
            x_telegram_init_data,
            bot_token=settings.telegram_bot_token,
            allowed_clock_skew_seconds=settings.allowed_clock_skew_seconds,
        )
        return AuthPrincipal(source="telegram", payload=payload)

    if settings.debug and settings.dev_auth_enabled:
        return AuthPrincipal(
            source="development",
            payload=TelegramAuthPayload(
                auth_date=None,
                query_id=None,
                chat_instance=None,
                chat_type=None,
                user=TelegramUserPayload(
                    id=settings.dev_auth_user_id,
                    username=settings.dev_auth_username,
                    first_name=settings.dev_auth_first_name,
                    last_name=settings.dev_auth_last_name,
                    is_premium=False,
                ),
            ),
        )

    raise ApiException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        code="unauthorized",
        message="Telegram init data header is required.",
    )


async def set_rls_user(session: AsyncSession, user_id: int) -> None:
    await session.execute(
        text("SELECT set_config('app.user_id', :user_id, true)"),
        {"user_id": str(user_id)},
    )


async def sync_user(session: AsyncSession, telegram_user: TelegramUserPayload) -> User:
    stmt = (
        insert(User)
        .values(
            telegram_id=telegram_user.id,
            username=telegram_user.username,
            first_name=telegram_user.first_name,
            last_name=telegram_user.last_name,
            photo_url=telegram_user.photo_url,
            language_code=telegram_user.language_code,
            is_premium=telegram_user.is_premium,
            last_auth_at=text("now()"),
        )
        .on_conflict_do_update(
            index_elements=[User.telegram_id],
            set_={
                "username": telegram_user.username,
                "first_name": telegram_user.first_name,
                "last_name": telegram_user.last_name,
                "photo_url": telegram_user.photo_url,
                "language_code": telegram_user.language_code,
                "is_premium": telegram_user.is_premium,
                "last_auth_at": text("now()"),
                "updated_at": text("now()"),
            },
        )
    )
    await session.execute(stmt)
    result = await session.execute(select(User).where(User.telegram_id == telegram_user.id))
    return result.scalar_one()


@asynccontextmanager
async def authenticated_transaction(session: AsyncSession, principal: AuthPrincipal):
    async with session.begin():
        await set_rls_user(session, principal.payload.user.id)
        user = await sync_user(session, principal.payload.user)
        yield user


async def get_session() -> AsyncSession:
    async for session in get_db_session():
        yield session
