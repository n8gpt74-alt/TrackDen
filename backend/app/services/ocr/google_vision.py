from app.services.ocr.base import OCRResult, OCRService


class GoogleVisionOCRService(OCRService):
    async def extract(self, *, file_path: str, original_filename: str | None) -> OCRResult:
        raise RuntimeError("Google Vision integration is not configured for this demo build.")
