from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class BotSettings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_prefix="BOT_",
        extra="ignore",
    )

    env: str = "development"
    log_level: str = "INFO"
    token: str = "replace-with-bot-token"
    webapp_url: str = "http://localhost:5173"


@lru_cache
def get_settings() -> BotSettings:
    return BotSettings()

