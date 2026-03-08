import hashlib
import re
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path

from app.services.ocr.base import OCRResult, OCRService


def _derive_merchant(original_filename: str | None, file_path: str) -> str:
    stem = Path(original_filename or file_path).stem
    humanized = re.sub(r"[_\\-]+", " ", stem).strip()
    humanized = re.sub(r"\s+", " ", humanized)
    return humanized.title() or "Demo Store"


class MockOCRService(OCRService):
    async def extract(self, *, file_path: str, original_filename: str | None) -> OCRResult:
        filename = original_filename or Path(file_path).name
        amount_match = re.search(r"(\d+[.,]\d{1,2})", filename)

        if amount_match:
            total = Decimal(amount_match.group(1).replace(",", "."))
        else:
            digest = hashlib.sha256(Path(file_path).read_bytes()).hexdigest()
            total = (Decimal(int(digest[:8], 16) % 250_00) / Decimal("100")) + Decimal("50")

        total = total.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        merchant = _derive_merchant(original_filename, file_path)

        return OCRResult(
            provider="mock",
            total=total,
            merchant=merchant,
            raw={
                "confidence": 0.91,
                "provider": "mock",
                "filename": filename,
                "merchant": merchant,
                "total": str(total),
            },
        )

