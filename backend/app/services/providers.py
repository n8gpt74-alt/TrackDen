from app.core.config import Settings, get_settings
from app.services.ai.base import CategorizationService
from app.services.ai.mock import MockCategorizationService
from app.services.ai.openai import OpenAICategorizationService
from app.services.ocr.base import OCRService
from app.services.ocr.google_vision import GoogleVisionOCRService
from app.services.ocr.mock import MockOCRService


def get_ocr_service(settings: Settings | None = None) -> OCRService:
    resolved_settings = settings or get_settings()
    if resolved_settings.ocr_provider == "google_vision":
        return GoogleVisionOCRService()
    return MockOCRService()


def get_ai_service(settings: Settings | None = None) -> CategorizationService:
    resolved_settings = settings or get_settings()
    if resolved_settings.ai_provider == "openai":
        return OpenAICategorizationService()
    return MockCategorizationService()

