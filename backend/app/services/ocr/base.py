from abc import ABC, abstractmethod
from decimal import Decimal
from typing import Any

from pydantic import BaseModel


class OCRResult(BaseModel):
    provider: str
    total: Decimal | None = None
    merchant: str | None = None
    raw: dict[str, Any] | None = None


class OCRService(ABC):
    @abstractmethod
    async def extract(self, *, file_path: str, original_filename: str | None) -> OCRResult:
        raise NotImplementedError

