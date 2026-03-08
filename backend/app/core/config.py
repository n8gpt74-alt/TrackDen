from functools import lru_cache
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_prefix="BACKEND_",
        extra="ignore",
    )

    app_name: str = "Personal Finance Tracker API"
    env: str = "development"
    debug: bool = False
    host: str = "0.0.0.0"
    port: int = 8000
    api_v1_prefix: str = "/api/v1"
    cors_origins: str = "http://localhost:5173"
    database_url: str = Field(default="postgresql+asyncpg://finance_user:finance_password@postgres:5432/finance_tracker")
    sync_database_url: str = Field(default="postgresql+psycopg://finance_user:finance_password@postgres:5432/finance_tracker")
    redis_url: str | None = Field(default="redis://redis:6379/0")
    secret_key: str = "change-me"
    telegram_bot_token: str = "replace-with-bot-token"
    allowed_clock_skew_seconds: int = 300
    upload_dir: str = "/app/uploads"
    ocr_provider: Literal["mock", "google_vision"] = "mock"
    ai_provider: Literal["mock", "openai"] = "mock"
    log_level: str = "INFO"
    max_upload_bytes: int = 10 * 1024 * 1024
    dev_auth_enabled: bool = True
    dev_auth_user_id: int = 777000
    dev_auth_username: str = "local_dev"
    dev_auth_first_name: str = "Local"
    dev_auth_last_name: str = "Developer"

    @property
    def cors_origins_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def redis_enabled(self) -> bool:
        if not self.redis_url:
            return False
        normalized = self.redis_url.strip().lower()
        return normalized not in {'', 'none', 'null', 'disabled'}


@lru_cache
def get_settings() -> Settings:
    return Settings()

