from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.schemas.category import CategoryRead


class UserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    telegram_id: int
    username: str | None = None
    first_name: str | None = None
    last_name: str | None = None
    photo_url: str | None = None
    language_code: str | None = None
    is_premium: bool
    default_currency: str
    timezone: str
    last_auth_at: datetime | None = None


class SessionResponse(BaseModel):
    auth_source: str
    user: UserRead
    categories: list[CategoryRead]

