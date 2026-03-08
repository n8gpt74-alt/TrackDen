import uuid
from datetime import datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import BigInteger, DateTime, Enum, ForeignKey, Integer, Numeric, String, Text, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.models.base import Base, TimestampMixin
from app.db.models.transaction import OCRProvider, ReceiptStatus, _enum_values


class Receipt(TimestampMixin, Base):
    __tablename__ = "receipts"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.telegram_id", ondelete="CASCADE"), nullable=False)
    uploaded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("now()"))
    storage_path: Mapped[str] = mapped_column(String(1024), nullable=False)
    original_filename: Mapped[str | None] = mapped_column(String(255))
    mime_type: Mapped[str | None] = mapped_column(String(255))
    size_bytes: Mapped[int | None] = mapped_column(Integer)
    sha256: Mapped[str | None] = mapped_column(String(64))
    ocr_provider: Mapped[OCRProvider] = mapped_column(
        Enum(OCRProvider, name="ocr_provider", native_enum=True, values_callable=_enum_values),
        nullable=False,
        default=OCRProvider.MOCK,
        server_default=OCRProvider.MOCK.value,
    )
    status: Mapped[ReceiptStatus] = mapped_column(
        Enum(ReceiptStatus, name="receipt_status", native_enum=True, values_callable=_enum_values),
        nullable=False,
        default=ReceiptStatus.PENDING,
        server_default=ReceiptStatus.PENDING.value,
    )
    ocr_raw: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    extracted_total: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    extracted_merchant: Mapped[str | None] = mapped_column(String(255))
    error: Mapped[str | None] = mapped_column(Text)
    processed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
