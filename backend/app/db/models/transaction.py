import enum
import uuid
from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import BigInteger, DateTime, Enum, Float, ForeignKey, Numeric, String, Text, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.models.base import Base, TimestampMixin

if TYPE_CHECKING:
    from app.db.models.category import Category
    from app.db.models.receipt import Receipt


def _enum_values(enum_cls: type[enum.Enum]) -> list[str]:
    return [str(member.value) for member in enum_cls]


class TransactionType(str, enum.Enum):
    EXPENSE = "expense"
    INCOME = "income"


class TransactionSource(str, enum.Enum):
    MANUAL = "manual"
    OCR = "ocr"


class ReceiptStatus(str, enum.Enum):
    PENDING = "pending"
    PROCESSED = "processed"
    FAILED = "failed"


class OCRProvider(str, enum.Enum):
    MOCK = "mock"
    GOOGLE_VISION = "google_vision"


class AIProvider(str, enum.Enum):
    MOCK = "mock"
    OPENAI = "openai"


class Transaction(TimestampMixin, Base):
    __tablename__ = "transactions"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.telegram_id", ondelete="CASCADE"), nullable=False)
    type: Mapped[TransactionType] = mapped_column(
        Enum(TransactionType, name="transaction_type", native_enum=True, values_callable=_enum_values),
        nullable=False,
    )
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="RUB", server_default="RUB")
    category_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("categories.id"))
    description: Mapped[str | None] = mapped_column(Text)
    merchant: Mapped[str | None] = mapped_column(String(255))
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("now()"))
    source: Mapped[TransactionSource] = mapped_column(
        Enum(TransactionSource, name="transaction_source", native_enum=True, values_callable=_enum_values),
        nullable=False,
        default=TransactionSource.MANUAL,
        server_default=TransactionSource.MANUAL.value,
    )
    receipt_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("receipts.id", ondelete="SET NULL"))
    ai_provider: Mapped[AIProvider] = mapped_column(
        Enum(AIProvider, name="ai_provider", native_enum=True, values_callable=_enum_values),
        nullable=False,
        default=AIProvider.MOCK,
        server_default=AIProvider.MOCK.value,
    )
    ai_confidence: Mapped[float | None] = mapped_column(Float)

    category: Mapped["Category | None"] = relationship(lazy="joined")
    receipt: Mapped["Receipt | None"] = relationship(lazy="joined")
