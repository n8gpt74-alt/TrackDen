from datetime import datetime
from decimal import Decimal
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict

from app.db.models.transaction import OCRProvider, ReceiptStatus


class ReceiptRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    original_filename: str | None = None
    mime_type: str | None = None
    size_bytes: int | None = None
    status: ReceiptStatus
    ocr_provider: OCRProvider
    extracted_total: Decimal | None = None
    extracted_merchant: str | None = None
    ocr_raw: dict[str, Any] | None = None
    error: str | None = None
    uploaded_at: datetime
    processed_at: datetime | None = None
    created_at: datetime
    updated_at: datetime
